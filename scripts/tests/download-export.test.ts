import { expect, test } from 'bun:test';
import { downloadExportFile } from '../../app/src/lib/downloadExport';

test('protected exports use authorization headers and download a local blob', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalTimer = globalThis.setTimeout;
  const originalRevoke = URL.revokeObjectURL;
  let request: any;
  let clicked = false, removed = false, revoked = false;
  let cleanup: (() => void) | undefined;
  const link = { href: '', download: '', click() { clicked = true; }, remove() { removed = true; } };
  globalThis.fetch = (async (url, options) => {
    request = { url, options };
    return new Response('# 笔记正文', { headers: { 'Content-Type': 'text/markdown' } });
  }) as typeof fetch;
  globalThis.document = { createElement: () => link, body: { appendChild() {} } } as any;
  globalThis.setTimeout = ((callback: () => void) => { cleanup = callback; return 1; }) as any;
  URL.revokeObjectURL = value => { revoked = true; originalRevoke(value); };
  try {
    await downloadExportFile('/api/file/temp/note-15.md', '笔记.md', 'https://ink.example.com/', 'test-token');
    expect(request.options.headers.Authorization).toBe('Bearer test-token');
    expect(request.options.redirect).toBe('error');
    expect(request.url).toBe('https://ink.example.com/api/file/temp/note-15.md?download=true');
    expect(request.url).not.toContain('test-token');
    expect(link.href.startsWith('blob:')).toBe(true);
    expect(link.download).toBe('笔记.md');
    expect(clicked && removed).toBe(true);
    expect(revoked).toBe(false);
    cleanup!();
    expect(revoked).toBe(true);
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument; globalThis.setTimeout = originalTimer; URL.revokeObjectURL = originalRevoke; }
});

test('failed authentication is reported instead of downloading an error response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('Unauthorized', { status: 401 })) as typeof fetch;
  try { await expect(downloadExportFile('/api/file/temp/note.md', 'note.md', 'https://ink.example.com/', 'expired')).rejects.toThrow('登录状态已失效'); }
  finally { globalThis.fetch = originalFetch; }
});

test('credentials are never sent to a different origin or non-file endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = (async () => { requested = true; return new Response(''); }) as typeof fetch;
  try {
    await expect(downloadExportFile('https://other.example.com/api/file/note.md', 'note.md', 'https://ink.example.com/', 'private')).rejects.toThrow('地址无效');
    await expect(downloadExportFile('/signin', 'note.md', 'https://ink.example.com/', 'private')).rejects.toThrow('地址无效');
    expect(requested).toBe(false);
  } finally { globalThis.fetch = originalFetch; }
});
