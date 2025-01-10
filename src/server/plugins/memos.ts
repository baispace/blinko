import sqlite3 from 'sqlite3';
import { prisma } from '../prisma';
import { adminCaller, userCaller } from '../routers/_app';
import { FileService } from './files';
import { getGlobalConfig } from '../routers/config';
import { Context } from '../context';
type Memo = {
  id: string,
  created_ts: number,
  updated_ts: number,
  content: string,
}
export type ProgressResult = {
  type: 'success' | 'skip' | 'error';
  content?: string;
  error?: unknown;
}


export class Memos {
  private db: sqlite3.Database
  async initDB(filePath: string) {
    const dbPath = await FileService.getFile(filePath);
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('can not connect to memos db', err.message);
      }
    });
    return dbPath;
  }
  closeDB() {
    this.db.close()
  }

  async *importMemosDB(ctx: Context): AsyncGenerator<ProgressResult & { progress?: { current: number, total: number } }, void, unknown> {
    const rows: Memo[] = await new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM memo`, (err, rows: Memo[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });

    const total = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const blinkoNote = await prisma.notes.findFirst({ where: { content: row?.content } });
        if (blinkoNote) {
          yield { type: 'skip', content: row?.content, progress: { current: i + 1, total } };
          continue;
        }

        const note = await userCaller(ctx).notes.upsert({
          content: row?.content,
        });

        if (note) {
          await prisma.notes.update({
            where: { id: note.id },
            data: {
              createdAt: new Date(row!.created_ts * 1000),
              updatedAt: new Date(row!.updated_ts * 1000),
            }
          });
          yield {
            type: 'success',
            content: note.content.slice(0, 30),
            progress: { current: i + 1, total }
          };
        }
      } catch (error) {
        console.error('import memos error->', error);
        yield {
          type: 'error',
          content: row?.content.slice(0, 30),
          error,
          progress: { current: i + 1, total }
        };
      }
    }
  }

  async *importFiles(ctx: Context): AsyncGenerator<ProgressResult & { progress?: { current: number, total: number } }, void, unknown> {
    const resources = await new Promise<Array<{
      memo_id: number,
      filename: string,
      blob: string,
      size: number,
      reference?: string,
      internal_path?: string,
    }>>((resolve, reject) => {
      const results: any[] = [];
      this.db.each(
        `SELECT * FROM resource`,
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          results.push(row);
        },
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });

    const total = resources.length;
    for (let i = 0; i < resources.length; i++) {
      const row = resources[i];
      console.log(row)

      const memo: Memo = await new Promise<Memo>((resolve, reject) => {
        this.db.get(`SELECT * FROM memo WHERE id = ${row?.memo_id}`, (err, memo: Memo) => {
          if (err) reject(err);
          else resolve(memo);
        });
      });

      if (!memo) continue;

      const node = await prisma.notes.findFirst({ where: { content: memo.content } });
      if (!node) continue;

      try {
        const attachment = await prisma.attachments.findFirst({ where: { name: row?.filename } });
        if (attachment) {
          yield { type: 'skip', content: row?.filename, progress: { current: i + 1, total } };
          continue;
        }

        if (row?.blob) {
          const { filePath } = await FileService.uploadFile({
            //@ts-ignore
            buffer: row!.blob,
            originalName: row?.filename,
            type: "",
            accountId: Number(ctx.id),
            withOutAttachment: true
          });
          await FileService.createAttachment({
            path: filePath,
            name: row?.filename,
            size: row?.size,
            noteId: node.id,
            accountId: Number(ctx.id),
            type: ""
          });
        }

        const config = await getGlobalConfig({ useAdmin: true });
        //v0.22
        if (row?.reference && row?.reference != '') {
          await prisma.attachments.create({
            data: {
              name: row?.filename,
              path: config.objectStorage === 's3' ? '/api/s3file/' + row?.reference : '/api/file/' + row?.reference,
              size: row?.size,
              noteId: node.id,
            }
          });
        }

        //v0.21
        if (row?.internal_path && row?.internal_path != '') {
          await prisma.attachments.create({
            data: {
              name: row?.filename,
              path: config.objectStorage === 's3' ? '/api/s3file/' + row?.internal_path : '/api/file/' + row?.internal_path,
              size: row?.size,
              noteId: node.id,
            }
          });
        }

        yield {
          type: 'success',
          content: row?.filename,
          progress: { current: i + 1, total }
        };
      } catch (error) {
        console.error('import files error->', error);
        yield {
          type: 'error',
          content: row?.filename,
          error,
          progress: { current: i + 1, total }
        };
      }
    }
  }
}
