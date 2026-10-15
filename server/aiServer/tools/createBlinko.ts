import { userCaller } from '@server/routerTrpc/_app';
import { NoteType } from '@shared/lib/types';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod/v3';
import { verifyToken } from '@server/lib/helper';
import { stripThinkText } from '../aiModelFactory';

export const upsertBlinkoTool = createTool({
  id: 'upsert-blinko-tool',
  description: 'You are a blinko assistant. You can create different types of content. "Blinko" means flash thoughts or sudden inspiration - those fleeting ideas that pop into mind.',
  inputSchema: z.object({
    content: z.string().describe("The content to save. Tag is start with #"),
    type: z.string().optional().default('blinko').describe('Optional: The type of content: "blinko" (flash thoughts/sudden ideas/fleeting inspiration - the default), "note" (longer, structured content), or "todo" (tasks to be done)'),
    title: z.string().optional().describe('Optional: A short title for the note. Stored in metadata.title and shown in the card/editor header. Use this when the first line of `content` would make a poor title (it is long, is a tag, or starts with an image). Omit it and the title falls back to the first line of `content`.'),
    token: z.string().optional().describe("internal use, do not pass!")
  }),
  execute: async ({ context, runtimeContext }) => {
    const accountId = runtimeContext?.get('accountId') || (await verifyToken(context.token))?.sub;
    
    console.log(`create note:${context.content}, type:${context.type}, accountId:${accountId}`);
    
    // Convert string type to NoteType enum
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
      const note = await caller.notes.upsert({
        content: stripThinkText(context.content),
        type: noteType,
        // notes 表没有独立的 title 列，标题存在 metadata.title。
        // notes.upsert 在更新已有笔记时会浅合并 metadata，所以这里只传 title
        // 不会抹掉其他 metadata 字段。判 undefined 而不是真值：空字符串表示
        // 显式清除标题，回退到 content 首行。
        ...(context.title !== undefined ? { metadata: { title: context.title } } : {}),
      })
      console.log('Created note:', note)
      return note
    } catch (error) {
      console.log('Error creating note:', error)
      return error.message
    }
  }
});