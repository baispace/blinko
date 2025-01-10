import { CronTime } from "cron";
import path from 'path';
import fs from 'fs';
import { writeFile } from 'fs/promises'
import Package from '../../../package.json';
import { $ } from 'execa';
import AdmZip from 'adm-zip'
import { DBBAK_TASK_NAME, DBBAKUP_PATH, ROOT_PATH, TEMP_PATH, UPLOAD_FILE_PATH } from "@/lib/constant";
import { prisma } from "../prisma";
import { unlink } from "fs/promises";
import { createCaller } from "../routers/_app";
import { Context } from "../context";
import { BaseScheduleJob } from "./baseScheduleJob";

export type RestoreResult = {
  type: 'success' | 'skip' | 'error';
  content?: string;
  error?: unknown;
  progress?: { current: number; total: number };
}
export type ExportTimeRange = 'day' | 'week' | 'month' | 'quarter';

export class DBJob extends BaseScheduleJob {
  protected static taskName = DBBAK_TASK_NAME;
  protected static job = this.createJob();

  static {
    this.initializeJob();
  }

  protected static async RunTask() {
    try {
      const notes = await prisma.notes.findMany({
        select: {
          id: true,
          account: true,
          content: true,
          isArchived: true,
          isShare: true,
          isTop: true,
          createdAt: true,
          updatedAt: true,
          type: true,
          attachments: true,
          tags: true,
          references: true,
          referencedBy: true
        }
      });
      const exportData = {
        notes,
        exportTime: new Date(),
        version: Package.version
      };

      fs.writeFileSync(
        `${DBBAKUP_PATH}/bak.json`,
        JSON.stringify(exportData, null, 2)
      );

      const targetFile = UPLOAD_FILE_PATH + `/blinko_export.bko`;
      try {
        await unlink(targetFile);
      } catch (error) {
      }

      const zip = new AdmZip();
      zip.addLocalFolder(ROOT_PATH);
      zip.writeZip(targetFile);

      return { filePath: `/api/file/blinko_export.bko` };
    } catch (error) {
      throw new Error(error)
    }
  }

  static async *RestoreDB(filePath: string, ctx: Context): AsyncGenerator<RestoreResult & { progress: { current: number; total: number } }, void, unknown> {
    try {
      const zip = new AdmZip(filePath);
      zip.extractAllTo(ROOT_PATH, true);

      const backupData = JSON.parse(
        fs.readFileSync(`${DBBAKUP_PATH}/bak.json`, 'utf-8')
      );

      const attachmentsCount = backupData.notes.reduce((acc, note) =>
        acc + (note.attachments?.length || 0), 0);
      const total = backupData.notes.length + attachmentsCount;
      let current = 0;

      const accountMap = new Map();
      for (const note of backupData.notes) {
        if (!note.account?.name) {
          yield {
            type: 'error',
            content: 'Note missing account information',
            error: new Error('Missing account information'),
            progress: { current: 0, total }
          };
          continue;
        }

        if (!accountMap.has(note.account.name)) {
          const account = await prisma.accounts.findFirst({
            where: { name: note.account.name }
          });

          if (!account) {
            const newAccount = await prisma.accounts.create({
              data: {
                name: note.account.name,
                password: note.account.password,
                role: note.account.role
              }
            });
            accountMap.set(note.account.name, newAccount);
          } else {
            accountMap.set(note.account.name, account);
          }
        }
      }

      for (const note of backupData.notes) {
        current++;
        if (!note.account?.name) {
          yield {
            type: 'error',
            content: 'Note missing account information',
            error: new Error('Missing account information'),
            progress: { current, total }
          };
          continue;
        }

        const accountInfo = accountMap.get(note.account.name);
        if (!accountInfo) {
          yield {
            type: 'error',
            content: `Account not found: ${note.account.name}`,
            error: new Error('Account not found'),
            progress: { current, total }
          };
          continue;
        }

        try {
          await prisma.$transaction(async (tx) => {
            let ctx = {
              name: accountInfo.name,
              sub: accountInfo.id,
              role: accountInfo.role,
              id: accountInfo.id,
              exp: 0,
              iat: 0,
            }
            const userCaller = createCaller(ctx);
            const createdNote = await userCaller.notes.upsert({
              content: note.content,
              isArchived: note.isArchived,
              type: note.type,
              isTop: note.isTop,
              isShare: note.isShare,
            });

            if (createdNote.id) {
              const account = accountMap.get(note.account.name);
              await tx.notes.update({
                where: { id: createdNote.id },
                data: {
                  accountId: account.id,
                  createdAt: note.createdAt,
                  updatedAt: note.updatedAt,
                }
              });
              if (note.attachments?.length) {
                const attachmentData = note.attachments.map(attachment => ({
                  ...attachment,
                  noteId: createdNote.id
                }));
                await tx.attachments.createMany({
                  data: attachmentData,
                  skipDuplicates: true
                });
                current += note.attachments.length;
              }
            }
          });

          yield {
            type: 'success',
            content: note.account.name + ' - ' + note.content.slice(0, 30),
            progress: { current, total }
          };

        } catch (error) {
          yield {
            type: 'error',
            content: note.content.slice(0, 30),
            error,
            progress: { current, total }
          };
          continue;
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        error,
        content: error.message ?? 'internal error',
        progress: { current: 0, total: 0 }
      };
    }
  }

  static async ExporMDFiles(params: {
    baseURL: string;
    startDate?: Date;
    endDate?: Date;
    ctx: Context;
    format: 'markdown' | 'csv' | 'json';
  }) {
    const { baseURL, startDate, endDate, ctx, format } = params;
    const notes = await prisma.notes.findMany({
      where: {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate })
        },
        accountId: Number(ctx.id)
      },
      select: {
        id: true,
        content: true,
        attachments: true,
        createdAt: true,
      }
    });
    if (notes.length === 0) {
      throw new Error('No notes found');
    }
    const exportDir = path.join(TEMP_PATH, 'exports');
    const attachmentsDir = path.join(exportDir, 'files');
    const zipFilePath = TEMP_PATH + `/notes_export_${Date.now()}.zip`;

    try {
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      if (!fs.existsSync(attachmentsDir)) {
        fs.mkdirSync(attachmentsDir, { recursive: true });
      }

      if (format === 'csv') {
        const csvContent = ['ID,Content,Created At'].concat(
          notes.map(note => `${note.id},"${note.content.replace(/"/g, '""')}",${note.createdAt.toISOString()}`)
        ).join('\n');
        await writeFile(path.join(exportDir, 'notes.csv'), csvContent);
      } else if (format === 'json') {
        await writeFile(
          path.join(exportDir, 'notes.json'),
          JSON.stringify(notes, null, 2)
        );
      } else {
        await Promise.all(notes.map(async (note) => {
          let mdContent = note.content;

          if (note.attachments?.length) {
            await Promise.all(note.attachments.map(async (attachment) => {
              try {
                const response = await fetch(`${baseURL}${attachment.path}`);
                const buffer = await response.arrayBuffer();
                const attachmentPath = path.join(attachmentsDir, attachment.name);
                //@ts-ignore
                await writeFile(attachmentPath, Buffer.from(buffer));

                const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.name);

                if (isImage) {
                  mdContent += `\n![${attachment.name}](./files/${attachment.name})`;
                } else {
                  mdContent += `\n[${attachment.name}](./files/${attachment.name})`;
                }
              } catch (error) {
                console.error(`Failed to download attachment: ${attachment.name}`, error);
              }
            }));
          }

          const fileName = `note-${note.id}-${note.createdAt.getTime()}.md`;
          await writeFile(path.join(exportDir, fileName), mdContent);
        }));
      }

      const zip = new AdmZip();
      zip.addLocalFolder(exportDir);
      zip.writeZip(zipFilePath);

      fs.rmSync(exportDir, { recursive: true, force: true });
      return {
        success: true,
        path: zipFilePath.replace(UPLOAD_FILE_PATH, ''),
        fileCount: notes.length
      };
    } catch (error) {
      try {
        if (fs.existsSync(exportDir)) {
          fs.rmSync(exportDir, { recursive: true, force: true });
        }
        if (fs.existsSync(zipFilePath)) {
          fs.unlinkSync(zipFilePath);
        }
      } catch { }
      throw error;
    }
  }
}