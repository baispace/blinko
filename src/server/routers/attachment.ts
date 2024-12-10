import { router, authProcedure } from '../trpc';
import { z } from 'zod';
import { prisma } from '../prisma';

export const attachmentsRouter = router({
  list: authProcedure
    .input(z.object({
      page: z.number().default(1),
      size: z.number().default(10),
      searchText: z.string().default('').optional()
    }))
    .query(async function ({ input, ctx }) {
      const { page, size, searchText } = input
      const result = await prisma.attachments.findMany({
        skip: (page - 1) * size,
        where: { note: { accountId: Number(ctx.id) }, path: { contains: searchText?.toLowerCase(), mode: 'insensitive' } },
        take: size,
        orderBy: {
          createdAt: 'desc'
        }
      })
      return result
    })
})
