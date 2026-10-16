/** Flush queued edits first; never rewrite an unchanged document just to close a window. */
export async function settleBeforeClose({ flush, isDirty, save }: {
  flush:()=>Promise<void>; isDirty:()=>boolean; save:()=>Promise<boolean>;
}):Promise<boolean> {
  try { await flush(); return isDirty() ? await save() : true; }
  catch { return false; }
}
