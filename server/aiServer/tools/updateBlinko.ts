import { userCaller } from '@server/routerTrpc/_app';
import { NoteType } from '@shared/lib/types';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod/v3';
import { verifyToken } from '@server/lib/helper';
import { stripThinkText } from '../aiModelFactory';

export const updateBlinkoTool = createTool({
  id: 'update-blinko-tool',
  description: 'you are a blinko assistant,you can use api to update blinko,save to database',
  //@ts-ignore
  inputSchema: z.object({
    id: z.number().describe('the note ID'),
    content: z.string().describe('note content'),
    type: z.string().optional().default('blinko').describe('Optional: The type of content: "blinko" (flash thoughts/sudden ideas/fleeting inspiration - the default), "note" (longer, structured content), or "todo" (tasks to be done)'),
    title: z.string().optional().describe('Optional: A short title for the note. Stored in metadata.title and shown in the card/editor header. Omit it to keep the existing title. Pass an empty string to clear it.'),
    isArchived: z.union([z.boolean(), z.null()]).default(null).describe('is archived'),
    isTop: z.union([z.boolean(), z.null()]).default(null).describe('is top'),
    isShare: z.union([z.boolean(), z.null()]).default(null),
    isRecycle: z.union([z.boolean(), z.null()]).default(null),
    token: z.string().optional().describe("internal use, do not pass!")
  }),
  execute: async ({ context, runtimeContext }) => {
    const accountId = runtimeContext?.get('accountId') || (await verifyToken(context.token))?.sub;
    let noteType: NoteType;
    const typeStr = (context.type || 'blinko').toLowerCase();

    switch (typeStr) {
      case 'note':
      case '1':
        noteType = NoteType.NOTE; // 1
        break;
      case 'todo':
      case '2':
        noteType = NoteType.TODO; // 2
        break;
      case 'blinko':
      case '0':
      default:
        noteType = NoteType.BLINKO; // 0
        break;
    }
    try {
      const caller = userCaller({
        id: String(accountId),
        exp: 0,
        iat: 0,
        name: 'admin',
        sub: String(accountId),
        role: 'superadmin'
      })
      return await caller.notes.upsert({
        content: stripThinkText(context.content),
        type: noteType,
        id: context.id,
        // 空字符串是「清除标题」的显式信号，所以这里判 undefined 而不是真值。
        // 传 null/不传则保持原标题不变。
        ...(context.title !== undefined ? { metadata: { title: context.title } } : {}),
      })
    } catch (error) {
      console.log(error)
      return error.message
    }
  }
});