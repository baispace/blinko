import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const createBlinkoTool = createTool({
  id: 'create-blinko-tool',
  description: 'you are a blinko assistant,you can use api to create blinko',
  //@ts-ignore
  inputSchema: z.object({
    content: z.string()
  }),
  execute: async ({ context }) => {
    console.log(`create note:${context.content}`);
    return 'success'
  }
});