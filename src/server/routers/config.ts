import { router, authProcedure, superAdminAuthMiddleware, publicProcedure } from '../trpc';
import { z } from 'zod';
import { prisma } from '../prisma';
import { GlobalConfig, ZConfigKey, ZConfigSchema, ZUserPerferConfigKey } from '../types';
import { configSchema } from '@/lib/prismaZodType';
import { Context } from '../context';

export const getGlobalConfig = async ({ ctx, useAdmin = false }: { ctx?: Context, useAdmin?: boolean }) => {
  const userId = Number(ctx?.id ?? 0);
  const configs = await prisma.config.findMany();
  const isSuperAdmin = useAdmin ? true : ctx?.role === 'superadmin';

  const globalConfig = configs.reduce((acc, item) => {
    const config = item.config as { type: string, value: any };
    if (item.key === 'isUseAI'
      || item.key == 'isCloseBackgroundAnimation'
      || item.key == 'isAllowRegister'
      || item.key == 'language'
      || item.key == 'theme'
      || item.key == 'themeColor'
      || item.key == 'themeForegroundColor'
      || item.key == 'maxHomePageWidth'
    ) {
      acc[item.key] = config.value;
      return acc;
    }
    if (!isSuperAdmin && !item.userId) {
      return acc;
    }
    const isUserPreferConfig = ZUserPerferConfigKey.safeParse(item.key).success;
    if ((isUserPreferConfig && item.userId === userId) || (!isUserPreferConfig)) {
      acc[item.key] = config.value;
    }
    return acc;
  }, {} as Record<string, any>);

  return globalConfig as GlobalConfig;
};

export const configRouter = router({
  list: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/config/list', summary: 'Query user config list', protect: true, tags: ['Config'] } })
    .input(z.void())
    .output(ZConfigSchema)
    .query(async function ({ ctx }) {
      return await getGlobalConfig({ ctx })
    }),
  update: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/config/update', summary: 'Update user config', protect: true, tags: ['Config'] } })
    .input(z.object({
      key: ZConfigKey,
      value: z.any()
    }))
    .output(configSchema)
    .mutation(async function ({ input, ctx }) {
      const userId = Number(ctx.id)
      const { key, value } = input
      const isUserPreferConfig = ZUserPerferConfigKey.safeParse(key).success;
      if (isUserPreferConfig) {
        const hasKey = await prisma.config.findFirst({ where: { userId, key } })
        if (hasKey) {
          return await prisma.config.update({ where: { id: hasKey.id }, data: { config: { type: typeof value, value } } })
        }
        return await prisma.config.create({ data: { userId, key, config: { type: typeof value, value } } })
      } else {
        if (ctx.role !== 'superadmin') {
          throw new Error('You are not allowed to update global config')
        }
        // global config
        const hasKey = await prisma.config.findFirst({ where: { key } })
        if (hasKey) {
          return await prisma.config.update({ where: { id: hasKey.id }, data: { config: { type: typeof value, value } } })
        }
        return await prisma.config.create({ data: { key, config: { type: typeof value, value } } })
      }
    }),
})
