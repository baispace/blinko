import { expect, test } from 'bun:test';
import { prisma } from '../../server/prisma';
import { getTodoPage, todoPageInput } from '../../server/lib/todoPages';
import { getConversationMessages, getChatContext } from '../../server/lib/conversationPages';

// Explicit opt-in: fixtures and assertions run in one transaction that always rolls back.
const integration = process.env.RUN_LIST_DB_TESTS === '1' ? test : test.skip;
integration('isolated list paging, global priority, summaries and conversation context', async () => {
  const rollback = new Error('ROLLBACK_TEST_FIXTURES');
  try {
    await prisma.$transaction(async db => {
      const owner = await db.accounts.create({ data: { name: 'list-test-rollback' } });
      const outsider = await db.accounts.create({ data: { name: 'list-test-outsider-rollback' } });
      let fixtureId = -Math.floor(Date.now() / 1000);
      const date = new Date('2020-01-01T00:00:00Z');
      await db.notes.createMany({ data: Array.from({ length: 1005 }, (_, i) => ({ id: fixtureId++, accountId: owner.id, type: 2, content: `item-${i} ${'长内容'.repeat(700)}`, createdAt: date, updatedAt: date, metadata: { priorityUrgent: false, priorityImportant: false } })) });
      const urgent = await db.notes.create({ data: { id: fixtureId++, accountId: owner.id, type: 2, content: 'urgent 100%_literal', createdAt: date, updatedAt: date, metadata: { priorityUrgent: true, priorityImportant: true, expireAt: 'invalid' } } });
      await db.notes.create({ data: { id: fixtureId++, accountId: owner.id, type: 2, content: 'future', metadata: { expireAt: '2099-01-01' } } });
      await db.notes.create({ data: { id: fixtureId++, accountId: owner.id, type: 2, content: 'completed previously but edited today', isArchived: true, metadata: { completedAt: date.toISOString() } } });
      const first = await getTodoPage(todoPageInput.parse({}), owner.id, db);
      expect(first.counts).toEqual({ today: 1006, upcoming: 1, done: 1 });
      expect(first.items[0].id).toBe(urgent.id);
      const long = first.items.find(note => note.contentLength > 1200)!;
      expect(long.content.length).toBe(1200);
      expect(long.isSummary).toBe(true);
      const ids = first.items.map(note => note.id);
      let cursor = first.nextCursor;
      while (cursor) {
        const page = await getTodoPage(todoPageInput.parse({ cursor, withCounts: false }), owner.id, db);
        expect(page.counts).toBeNull();
        ids.push(...page.items.map(note => note.id)); cursor = page.nextCursor;
      }
      expect(ids.length).toBe(1006); expect(new Set(ids).size).toBe(1006);
      expect((await getTodoPage(todoPageInput.parse({ searchText: '100%_literal' }), owner.id, db)).items.map(note => note.id)).toEqual([urgent.id]);
      expect((await getTodoPage(todoPageInput.parse({}), outsider.id, db)).counts).toEqual({ today: 0, upcoming: 0, done: 0 });
      await expect(getTodoPage(todoPageInput.parse({ bucket: 'done', cursor: first.nextCursor! }), owner.id, db)).rejects.toThrow();
      const conversation = await db.conversation.create({ data: { accountId: owner.id } });
      const system = await db.message.create({ data: { id: fixtureId++, conversationId: conversation.id, content: 'system', role: 'system', createdAt: date } });
      const workflow = await db.message.create({ data: { id: fixtureId++, conversationId: conversation.id, content: 'workflow background', role: 'user', metadata: { workflow: { key: 'daily' } }, createdAt: date } });
      await db.message.createMany({ data: Array.from({ length: 90 }, (_, i) => ({ id: fixtureId++, conversationId: conversation.id, content: `message-${i}`, role: i % 2 ? 'assistant' : 'user', createdAt: date })) });
      const question = await db.message.create({ data: { id: fixtureId++, conversationId: conversation.id, content: 'question', role: 'user', createdAt: date } });
      const history = await getConversationMessages(conversation.id, owner.id, 40, undefined, db);
      const messages = [...history.items]; let before = history.nextCursor;
      while (before) { const page = await getConversationMessages(conversation.id, owner.id, 40, before, db); messages.unshift(...page.items); before = page.nextCursor; }
      expect(messages.length).toBe(93); expect(new Set(messages.map(message => message.id)).size).toBe(93);
      expect(messages[0].id).toBe(system.id); expect(messages[1].id).toBe(workflow.id);
      const context = await getChatContext(conversation.id, question.id, owner.id, db);
      expect(context.length).toBe(42); expect(context[0].content).toBe('system'); expect(context[1].content).toBe('workflow background');
      await expect(getConversationMessages(conversation.id, outsider.id, 40, undefined, db)).rejects.toThrow();
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
}, 40000);
