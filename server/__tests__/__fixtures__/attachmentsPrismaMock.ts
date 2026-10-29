import { mock } from 'bun:test';

/**
 * attachments 表的 prisma mock。
 *
 * bun 的 `mock.module` 是**进程级**的：同一个模块在同一进程里只有一份生效版本，
 * 后注册的覆盖先注册的。`upload.test.ts` 和 `attachment.deleteMany.test.ts`
 * 都要 mock `server/prisma`，如果各自建一套 mock 函数，谁最后被加载谁就覆盖另一个，
 * 测试结果就会依赖文件加载顺序。
 *
 * 所以把 mock 函数提到这个共享模块里，两个测试文件引用同一组实例，
 * 这样无论加载顺序如何，看到的都是同一份。
 */
export const attachmentCreate = mock(async () => ({ id: 1 }));
export const attachmentFindFirst = mock(async () => null);
export const attachmentDelete = mock(async () => undefined);
export const attachmentFindMany = mock(async (_args: any) => [] as any[]);
export const attachmentDeleteMany = mock(async (_args: any) => ({ count: 0 }));

mock.module('../../prisma', () => ({
  prisma: {
    attachments: {
      create: attachmentCreate,
      findFirst: attachmentFindFirst,
      delete: attachmentDelete,
      findMany: attachmentFindMany,
      deleteMany: attachmentDeleteMany,
    },
  },
}));

mock.module('@prisma/client', () => ({ Prisma: {} }));
