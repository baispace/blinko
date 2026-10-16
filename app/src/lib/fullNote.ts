import { api } from './trpc';
import type { Note } from '@shared/lib/types';
const pending = new Map<number, Promise<any>>();
/** A summary is display-only. Never use its content as an editing/copying source. */
export async function getFullNote<T extends Note>(note: T): Promise<T> {
  if (!note.isSummary || !note.id) return note;
  const id = note.id;
  let request = pending.get(id);
  if (!request) {
    request = api.notes.detail.mutate({ id }).then(value => { if (!value) throw new Error('内容不存在或无权访问'); return { ...value, isSummary: false }; });
    pending.set(id, request);
    void request.finally(() => { if (pending.get(id) === request) pending.delete(id); }).catch(() => {});
  }
  return await request as T;
}
