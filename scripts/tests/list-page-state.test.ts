import { expect, test, mock } from 'bun:test';
mock.module('@/store/root', () => ({ RootStore: { Get: () => ({ isOnline: true, error() {}, dismiss() {} }) } }));
mock.module('@/store/blinkoStore', () => ({ BlinkoStore: class {} }));
mock.module('@/store/baseStore', () => ({ BaseStore: class {} }));
mock.module('@/store/module/Toast/Toast', () => ({ ToastPlugin: class {} }));
mock.module('@/lib/event', () => ({ eventBus: { emit() {} } }));
mock.module('@/lib/i18n', () => ({ default: { t: (key: string) => key } }));
mock.module('@/lib/blinkoEndpoint', () => ({ getBlinkoEndpoint: () => '', isTauriAndEndpointUndefined: () => false }));
const { PromisePageState } = await import('../../app/src/store/standard/PromiseState');
test('late old filter response cannot replace the current list or release its loading state', async () => {
  const pending: Array<(rows: any[]) => void> = [];
  const state = new PromisePageState({ function: () => new Promise<any[]>(resolve => pending.push(resolve)) });
  const old = state.resetAndCall(); const current = state.resetAndCall();
  pending[0]!([{ id: 1 }]); await old;
  expect(state.loading.value).toBe(true); expect(state.value).toEqual([]);
  pending[1]!([{ id: 2 }]); await current;
  expect(state.loading.value).toBe(false); expect(state.value).toEqual([{ id: 2 }]);
  await state.callNextPage(); expect(pending.length).toBe(2);
});
let hydrateCalls = 0;
let finish: (value: any) => void;
mock.module('@/lib/trpc', () => ({ api: { notes: { detail: { mutate: () => { hydrateCalls++; return new Promise(resolve => { finish = resolve; }); } } } } }));
const { getFullNote } = await import('../../app/src/lib/fullNote');
test('concurrent summary actions hydrate one full record and never reuse a stale saved cache', async () => {
  const summary: any = { id: 123, isSummary: true, content: 'preview' };
  const a = getFullNote(summary); const b = getFullNote(summary);
  expect(hydrateCalls).toBe(1); finish!({ id: 123, content: 'complete article' });
  expect((await a).content).toBe('complete article'); expect((await b).isSummary).toBe(false);
  const next = getFullNote(summary); expect(hydrateCalls).toBe(2); finish!({ id: 123, content: 'newer article' });
  expect((await next).content).toBe('newer article');
});
test('reading current item does not mutate observable state during rendering', async () => {
  const { PromiseState } = await import('../../app/src/store/standard/PromiseState');
  const state = new PromiseState({ function: async () => [{ id: 1 }] });
  state.value = [{ id: 1 }]; state.currentIndex.setValue(9);
  expect(state.current).toEqual({ id: 1 }); expect(state.currentIndex.value).toBe(9);
  await state.setValue([{ id: 2 }]); expect(state.currentIndex.value).toBe(0);
});
