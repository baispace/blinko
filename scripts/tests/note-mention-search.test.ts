import { expect, test, mock } from 'bun:test';
let search: (params: any) => Promise<any[]> = async () => [];
mock.module('@/lib/trpc', () => ({ api: { notes: { list: { mutate: (params: any) => search(params) } } } }));
const { NoteMentionState } = await import('../../app/src/components/Common/Editor/Tiptap/noteMentionState');
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('empty @ query loads recent notes and prefers document titles', async () => {
  search = async params => {
    expect(params.searchText).toBe('');
    return [{ id: 1, content: 'body', metadata: { title: '标题' } }, { id: 2, content: 'self' }];
  };
  const state = new NoteMentionState();
  state.isOpen = true;
  state.currentNoteId = 2;
  await state.searchNotes('');
  await wait(30);
  expect(state.items.map(item => item.title)).toEqual(['标题']);
  state.close();
});

test('late responses cannot overwrite a newer search, failures are visible', async () => {
  let resolveOld: (value: any[]) => void = () => {};
  search = params => params.searchText === 'old' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve([{ id: 3, content: 'new' }]);
  const state = new NoteMentionState(); state.isOpen = true;
  await state.searchNotes('old'); await wait(210);
  await state.searchNotes('new'); await wait(210);
  resolveOld([{ id: 4, content: 'old' }]); await wait(10);
  expect(state.items[0]?.content).toBe('new');
  search = async () => { throw new Error('offline'); };
  await state.searchNotes('fail'); await wait(210);
  expect(state.error).toBe('搜索失败，请重试');
  expect(state.loading).toBe(false);
  state.close();
});
