import { router, authProcedure, demoAuthMiddleware } from '../trpc';
import { z } from 'zod';
import { prisma } from '../prisma';
import { DBJob } from '../plugins/dbjob';
import { ArchiveJob } from '../plugins/archivejob';
import { ARCHIVE_BLINKO_TASK_NAME, DBBAK_TASK_NAME, UPLOAD_FILE_PATH } from '@/lib/constant';
import { scheduledTaskSchema } from '@/lib/prismaZodType';
import { Memos } from '../plugins/memos';
import { unlink } from 'fs/promises';
import { FileService } from '../plugins/files';


export const taskRouter = router({
  list: authProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/tasks/list', summary: 'Query user task list', protect: true, tags: ['Task'] } })
    .input(z.void())
    .output(z.array(scheduledTaskSchema))
    .query(async () => {
      return await prisma.scheduledTask.findMany()
    }),
  upsertTask: authProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/tasks/upsert', summary: 'Upsert Task', protect: true, tags: ['Task'] } })
    .input(z.object({
      time: z.string().optional(),
      type: z.enum(['start', 'stop', 'update']),
      task: z.enum([ARCHIVE_BLINKO_TASK_NAME, DBBAK_TASK_NAME]),
    }))
    .output(z.any())
    .mutation(async ({ input }) => {
      const { time, type, task } = input
      if (type == 'start' && time) {
        return task == DBBAK_TASK_NAME ? await DBJob.Start(time, true) : await ArchiveJob.Start(time, true)
      }
      if (type == 'stop') {
        return task == DBBAK_TASK_NAME ? await DBJob.Stop() : await ArchiveJob.Stop()
      }
      if (type == 'update' && time) {
        return task == DBBAK_TASK_NAME ? await DBJob.SetCornTime(time) : await ArchiveJob.SetCornTime(time)
      }
    }),
  importFromBlinko: authProcedure.use(demoAuthMiddleware)
    .input(z.object({
      filePath: z.string()
    }))
    .mutation(async function* ({ input, ctx }) {
      const { filePath } = input
      try {
        const localFilePath = await FileService.getFile(filePath)
        const res = DBJob.RestoreDB(localFilePath, ctx)
        for await (const result of res) {
          yield result;
        }
        try {
          await unlink(localFilePath)
          await FileService.deleteFile(filePath)
        } catch (error) {
        }
      } catch (error) {
        throw new Error(error)
      }
    }),

  importFromMemos: authProcedure.use(demoAuthMiddleware)
    .input(z.object({
      filePath: z.string() //xxxx.db
    }))
    .mutation(async function* ({ input, ctx }) {
      try {
        const memos = new Memos();
        const dbPath = await memos.initDB(input.filePath);
        for await (const result of memos.importMemosDB(ctx)) {
          yield result;
        }
        for await (const result of memos.importFiles()) {
          yield result;
        }
        memos.closeDB();
        console.log({ dbPath })
        try {
          await unlink(dbPath)
          await FileService.deleteFile(input.filePath)
        } catch (error) {
        }
      } catch (error) {
        throw new Error(error)
      }
    }),
})
