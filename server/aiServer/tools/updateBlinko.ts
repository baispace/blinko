import { userCaller } from '@server/routerTrpc/_app';
import { NoteType } from '@shared/lib/types';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const updateBlinkoTool = createTool({
  id: 'update-blinko-tool',
  description: 'you are a blinko assistant,you can use api to batch update blinko,save to database',
  //@ts-ignore
  inputSchema: z.object({
    notes: z.array(z.object({
      id: z.number().describe('the note ID'),
      content: z.string().describe('note content'),
      type: z.string().optional().default('blinko').describe('Optional: The type of content: "blinko" (flash thoughts/sudden ideas/fleeting inspiration - the default), "note" (longer, structured content), or "todo" (tasks to be done)'),
      isArchived: z.union([z.boolean(), z.null()]).default(null).describe('is archived'),
      isTop: z.union([z.boolean(), z.null()]).default(null).describe('is top'),
      isShare: z.union([z.boolean(), z.null()]).default(null),
      isRecycle: z.union([z.boolean(), z.null()]).default(null),
    })).describe('Array of notes to update'),
  }),
  execute: async ({ context, runtimeContext }) => {
    // Get accountId from runtime context
    const accountId = runtimeContext?.get('accountId');
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
      return await Promise.all(context.notes.map(async (note, index) => {
        return caller.notes.upsert({
          content: note.content,
          type: typeStr,
          id: note.id
        })
      }))
    } catch (error) {
      console.log(error)
      return error.message
    }
  }
});