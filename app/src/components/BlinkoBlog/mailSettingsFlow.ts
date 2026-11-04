/** Test only the saved configuration; a failed save must never send mail. */
export async function testSavedMailSettings<T>({ dirty, save, send }: {
  dirty: boolean;
  save: () => Promise<boolean>;
  send: () => Promise<T>;
}): Promise<{ skipped: true } | { skipped: false; result: T }> {
  if (dirty && !await save()) return { skipped: true };
  return { skipped: false, result: await send() };
}
