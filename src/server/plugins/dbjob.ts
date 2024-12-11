import { CronJob, CronTime } from "cron";
import path from 'path';
import fs from 'fs';
import Package from '../../../package.json';
import { $ } from 'execa';
import AdmZip from 'adm-zip'
import { ARCHIVE_BLINKO_TASK_NAME, DBBAK_TASK_NAME, DBBAKUP_PATH, ROOT_PATH, UPLOAD_FILE_PATH } from "@/lib/constant";
import { prisma } from "../prisma";
import { unlink } from "fs/promises";
import { createCaller } from "../routers/_app";

export type RestoreResult = {
  type: 'success' | 'skip' | 'error';
  content?: string;
  error?: unknown;
  progress?: { current: number; total: number };
}
export type ExportTimeRange = 'day' | 'week' | 'month' | 'quarter';


export class DBJob {
  static Job = new CronJob('* * * * *', async () => {
    try {
      const res = await DBJob.RunTask()
      await prisma.scheduledTask.update({ where: { name: DBBAK_TASK_NAME }, data: { isSuccess: true, output: res, lastRun: new Date() } })
    } catch (error) {
      await prisma.scheduledTask.update({ where: { name: DBBAK_TASK_NAME }, data: { isSuccess: false, output: { error: error.message ?? 'internal error' } } })
    }
  }, null, false);

  static async RunTask() {
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

  static async *RestoreDB(filePath: string, ctx: any): AsyncGenerator<RestoreResult & { progress: { current: number; total: number } }, void, unknown> {
    try {
      const zip = new AdmZip(filePath);
      zip.extractAllTo(ROOT_PATH, true);

      const backupData = JSON.parse(
        fs.readFileSync(`${DBBAKUP_PATH}/bak.json`, 'utf-8')
      );

      const attachmentsCount = backupData.notes.reduce((acc, note) =>
        acc + (note.attachments?.length || 0), 0);
      const total = backupData.notes.length + attachmentsCount - 1;
      let current = 0;

      for (const note of backupData.notes) {
        current++;
        try {
          const userCaller = createCaller(ctx)

          const createdNote = await userCaller.notes.upsert({
            content: note.content,
            isArchived: note.isArchived,
            type: note.type,
            isTop: note.isTop,
            isShare: note.isShare,
          })

          if (createdNote.id) {
            const account = await prisma.accounts.findFirst({
              where: { name: note.account.name }
            })
            let updateData: any = {
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
            }
            if (!account) {
              const _newAccount = await prisma.accounts.create({
                data: {
                  name: note.account.name,
                  password: note.account.password,
                  role: 'user'
                }
              })
              updateData.accountId = _newAccount.id
            } else {
              updateData.accountId = account.id
            }
            await prisma.notes.update({
              where: { id: createdNote.id },
              data: updateData
            });
          }

          yield {
            type: 'success',
            content: note.content.slice(0, 30),
            progress: { current, total }
          };

          if (note.attachments?.length) {
            for (const attachment of note.attachments) {
              current++;
              try {
                const existingAttachment = await prisma.attachments.findFirst({
                  where: { name: attachment.name }
                });
                await prisma.attachments.create({
                  data: {
                    ...attachment,
                    noteId: createdNote.id
                  }
                });

                yield {
                  type: 'success',
                  content: attachment.name,
                  progress: { current, total }
                };
              } catch (error) {
                yield {
                  type: 'error',
                  content: attachment.name,
                  error,
                  progress: { current, total }
                };
              }
            }
          }
        } catch (error) {
          yield {
            type: 'error',
            content: note.content.slice(0, 30),
            error,
            progress: { current, total }
          };
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

  static async Start(cronTime: string, immediate: boolean = true) {
    let success = false, output
    const hasTask = await prisma.scheduledTask.findFirst({ where: { name: DBBAK_TASK_NAME } })
    DBJob.Job.setTime(new CronTime(cronTime))
    DBJob.Job.start()
    if (immediate) {
      try {
        output = await DBJob.RunTask()
        success = true
      } catch (error) { output = error ?? (error.message ?? "internal error") }
    }
    if (!hasTask) {
      return await prisma.scheduledTask.create({ data: { lastRun: new Date(), output, isSuccess: success, schedule: cronTime, name: DBBAK_TASK_NAME, isRunning: DBJob.Job.running } })
    } else {
      return await prisma.scheduledTask.update({ where: { name: DBBAK_TASK_NAME }, data: { lastRun: new Date(), output, isSuccess: success, schedule: cronTime, isRunning: DBJob.Job.running } })
    }
  }

  static async Stop() {
    DBJob.Job.stop()
    return await prisma.scheduledTask.update({ where: { name: DBBAK_TASK_NAME }, data: { isRunning: DBJob.Job.running } })
  }

  static async SetCornTime(cronTime: string) {
    DBJob.Job.setTime(new CronTime(cronTime))
    await this.Start(cronTime, true)
    // return await prisma.scheduledTask.update({ where: { name: DBBAK_TASK_NAME }, data: { schedule: cronTime, lastRun: new Date() } })
  }

  static async ExporMDFiles(startDate: Date, endDate: Date) {
    const notes = await prisma.notes.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        id: true,
        account: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        attachments: true,
        tags: true
      }
    });

    const exportDir = path.join(ROOT_PATH, 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    for (const note of notes) {
      let mdContent = note.content

      if (note.attachments?.length) {
        mdContent += '### Attachments\n';
        note.attachments.forEach(attachment => {
          mdContent += `- ${attachment.name}\n`;
        });
        mdContent += '\n';
      }
      mdContent += '---\n\n';
      const fileName = `note-${note.id}.md`;
      fs.writeFileSync(path.join(exportDir, fileName), mdContent);
    }

    return {
      success: true,
      exportPath: exportDir,
      fileCount: notes.length
    };
  }
}