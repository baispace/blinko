import { expect, test, mock } from 'bun:test';
const messages: any[] = [];
let created: any[] = [];
let deleted: number[] = [];
let fail = false;
let editFailure = false;
let stopAtChunk: (() => void) | null = null;
class State {
  value: any; loading = { value: false }; config: any;
  constructor(config: any) { this.config = config; this.value = config.value; }
  setValue(value: any) { this.value = value; }
  async call() { this.value = await this.config.function(); return this.value; }
  async resetAndCall() { return []; }
}
mock.module('@/lib/trpc', () => ({
  api: {
    ai: { chatCapabilities: { query: async () => ({ canChat: true }) }, summarizeConversationTitle: { mutate: async () => {} } },
    conversation: { detail: { query: async () => ({ id: 1, messages: [...messages] }) } },
    message: { update: { mutate: async () => { if (editFailure) throw new Error('edit failed'); } }, clearAfter: { mutate: async () => {} }, create: { mutate: async (item: any) => { const result = { ...item, id: created.length + 20 }; created.push(result); return result; } }, delete: { mutate: async ({id}: any) => { deleted.push(id); } } },
  },
  streamApi: { ai: { completions: { mutate: async () => (async function* () {
    yield { chunk: { type: 'text-delta', textDelta: '已输出的部分' } };
    if (stopAtChunk) { stopAtChunk(); const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
    if (fail) throw new Error('provider failed');
    yield { chunk: { type: 'finish', usage: { totalTokens: 10 } } };
  })() } } },
}));
mock.module('@/store/standard/PromiseState', () => ({ PromiseState: State, PromisePageState: State, PromiseCall: async () => {} }));
mock.module('@/store/standard/StorageState', () => ({ StorageState: State }));
mock.module('@/store/standard/StorageListState', () => ({ StorageListState: State }));
mock.module('@/lib/event', () => ({ eventBus: { on() {}, off() {} } }));
mock.module('@/store/root', () => ({ RootStore: { Get: () => ({ error() {}, success() {} }) } }));
mock.module('@/store/blinkoStore', () => ({ BlinkoStore: class {} }));
mock.module('@/store/module/Toast/Toast', () => ({ ToastPlugin: class {} }));
mock.module('@/store/module/Dialog', () => ({ DialogStore: class {} }));
mock.module('@/components/BlinkoAi/aiTag', () => ({ AiTag: () => null }));
mock.module('@/components/BlinkoAi/aiEmoji', () => ({ AiEmoji: () => null }));
mock.module('@/lib/i18n', () => ({ default: { t: (key: string) => key } }));
const { AiStore } = await import('../../app/src/store/aiStore');
const setup = () => {
  messages.splice(0, messages.length, { id: 1, role: 'user', content: '问题' });
  created = []; deleted = []; fail = false; stopAtChunk = null;
  const store = new AiStore(); store.currentConversationId = 1; store.input = '问题'; return store;
};
test('stopping persists one partial reply with a stopped status and no system interruption record', async () => {
  const store = setup(); stopAtChunk = () => { void store.abortAiChat(); };
  await store.onInputSubmit(true);
  expect(created).toHaveLength(1);
  expect(created[0].role).toBe('assistant');
  expect(created[0].content).toBe('已输出的部分');
  expect(created[0].metadata.responseStatus).toBe('stopped');
  expect(store.chatStatus).toBe('stopped');
  expect(store.isPreparing || store.isAnswering).toBe(false);
});
test('failed streams preserve partial output and expose an actionable failure state', async () => {
  const store = setup(); fail = true; await store.onInputSubmit(true);
  expect(created[0].metadata.responseStatus).toBe('error');
  expect(store.chatError).toBe('provider failed');
  expect(store.isPreparing || store.isAnswering).toBe(false);
});
test('completed streams persist once and old replies cannot trigger regeneration', async () => {
  const store = setup(); await store.onInputSubmit(true);
  expect(created).toHaveLength(1);
  expect(created[0].metadata.responseStatus).toBe('completed');
  await store.regenerate(999);
  expect(deleted).toHaveLength(0);
});

test('failed message edits return false and release the submission lock', async () => {
  const store = setup(); editFailure = true;
  expect(await store.editUserMessage(1, '修改后的问题')).toBe(false);
  expect(store.isPreparing).toBe(false);
  expect(created).toHaveLength(0);
  editFailure = false;
});

test('quoted history keeps the visible user input separate from the full prompt and stores serializable task snapshots', async () => {
  const store = setup();
  store.referencesNotes = [{ id: 7, type: 2, content: '历史任务', metadata: { title: '任务标题' }, isArchived: false, createdAt: new Date('2026-10-14T00:00:00Z'), updatedAt: new Date('2026-10-15T00:00:00Z') }] as any;
  await store.onInputSubmit();
  expect(created[0].metadata.displayContent).toBe('问题');
  expect(created[0].metadata.sources[0].updatedAt).toBe('2026-10-15T00:00:00.000Z');
  expect(created[0].content).toContain('历史任务');
});
