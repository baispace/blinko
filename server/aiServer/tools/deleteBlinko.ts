import { userCaller } from '@server/routerTrpc/_app';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const deleteBlinkoTool = createTool({
  id: 'delete-blinko-tool',
  description: 'you are a blinko assistant,you can use api to delete blinko,save to database',
  //@ts-ignore
  inputSchema: z.object({
    ids: z.array(z.number())
  }),
  execute: async ({ context, runtimeContext }) => {
    // Get accountId from runtime context
    const accountId: any = runtimeContext?.get('accountId');

    try {
      const caller = userCaller({
        id: String(accountId),
        exp: 0,
        iat: 0,
        name: 'admin',
        sub: String(accountId),
        role: 'superadmin'
      })
      const note = await caller.notes.trashMany({
        ids: context.ids
      })
      return true
    } catch (error) {
      console.log(error)
      return error.message
    }
  }
});