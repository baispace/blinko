import { createCaller, userCaller } from '@/server/routers/_app';
import { NoteType } from '@/server/types';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const createBlinkoTool = createTool({
  id: 'create-blinko-tool',
  description: 'you are a blinko assistant,you can use api to create blinko,save to database',
  //@ts-ignore
  inputSchema: z.object({
    content: z.string(),
    accountId: z.number()
  }),
  execute: async ({ context }) => {
    console.log(`create note:${context.content}`);
    try {
      const caller = userCaller({
        id: context.accountId.toString(),
        exp: 0,
        iat: 0,
        name: 'admin',
        sub: context.accountId.toString(),
        role: 'superadmin'
      })
      const note = await caller.notes.upsert({
        content: context.content,
        type: NoteType.BLINKO,
      })
      console.log(note)
      return true
    } catch (error) {
      console.log(error)
      return error.message
    }
  }
});