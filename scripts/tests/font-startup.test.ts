import { expect, test } from 'bun:test';
import { waitForStartupFont } from '../../app/src/lib/fontStartup';

test('a stalled font task does not prevent page startup', async () => {
  const start = performance.now();
  await waitForStartupFont(new Promise(() => {}), 10);
  expect(performance.now() - start).toBeLessThan(250);
});
test('a ready cached font does not wait out the startup budget', async () => {
  let ready = false;
  await waitForStartupFont(Promise.resolve().then(() => { ready = true; }), 1000);
  expect(ready).toBe(true);
});
test('font preparation failures still allow page startup', async () => {
  await expect(waitForStartupFont(Promise.reject(new Error('cache unavailable')), 1000)).resolves.toBeUndefined();
});
