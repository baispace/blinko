/** Give cached glyphs a brief head start, never hold page rendering on font I/O. */
export async function waitForStartupFont(task: Promise<unknown>, budgetMs = 120): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task.catch(() => undefined),
      new Promise<void>(resolve => { timer = setTimeout(resolve, budgetMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
