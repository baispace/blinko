import { router, authProcedure } from '../trpc';
import { z } from 'zod';
import { prisma } from '../prisma';
import fs from 'fs/promises';
import path from 'path';

export const pluginRouter = router({
  saveDevPlugin: authProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/v1/plugin/save-dev',
        summary: 'Save development plugin',
        protect: true,
        tags: ['Plugin']
      }
    })
    .input(z.object({
      code: z.string(),
      fileName: z.string(),
    }))
    .output(z.any())
    .mutation(async function ({ input }) {
      const devPluginDir = path.join(process.cwd(), 'public', 'plugins', 'dev');
      try {
        await fs.rm(path.join(devPluginDir), { force: true });
        await fs.mkdir(devPluginDir, { recursive: true });
        await fs.writeFile(
          path.join(devPluginDir, input.fileName),
          input.code
        );

        return { success: true };
      } catch (error) {
        console.error('Save dev plugin error:', error);
        throw error;
      }
    }),
});
