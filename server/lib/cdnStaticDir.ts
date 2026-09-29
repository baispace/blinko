import fs from 'fs';
import path from 'path';

/**
 * Locate the built static-asset directory (the frontend build the server serves
 * under `/assets`, `/fonts`, `/icons`, `/locales`). The on-disk path varies a lot
 * by deployment:
 *   - local prod: `ncp dist/public server/public`  → server/public
 *   - docker build: app default outDir is `app/dist`, copied into the image
 *   - container WORKDIR is /app, server bundle at /app/server/index.js (or /app/dist)
 *   - dev source: app/dist
 * Rather than guess one offset, do a bounded BFS from a handful of likely roots
 * and return the first directory that actually looks like a built Vite app
 * (contains `index.html` AND an `assets/` folder). Failing that, accept any dir
 * with `index.html`.
 *
 * This MUST be shared between the upload flow and the `cdnStaticRewrite`
 * middleware so that the files we push to the CDN and the HTML we rewrite point
 * at the exact same directory — otherwise the rewrite silently no-ops while the
 * upload "succeeds", which is exactly the "uploaded but site not on CDN" bug.
 */
export function resolveStaticPublicDir(): string | null {
  const isDir = (p: string) => { try { return fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch { return false; } };
  const hasIndex = (dir: string) => isDir(dir) && (() => { try { return fs.existsSync(path.join(dir, 'index.html')); } catch { return false; } })();
  const hasAssets = (dir: string) => isDir(path.join(dir, 'assets'));

  // Seed BFS roots with the most likely locations across every known layout.
  const roots = new Set<string>([
    process.cwd(),
    __dirname,
    path.dirname(__dirname),
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', 'server'),
    path.resolve(__dirname, '..', 'app', 'dist'),
    path.resolve(__dirname, '..', 'app', 'dist', 'public'),
    path.resolve(process.cwd(), 'server', 'public'),
    path.resolve(process.cwd(), 'app', 'dist'),
    path.resolve(process.cwd(), 'app', 'dist', 'public'),
    path.resolve(process.cwd(), 'app', 'public'),
    '/app',
    '/app/server',
    '/app/server/public',
    '/app/dist',
    '/app/dist/public',
    '/app/app/dist',
    '/app/app/dist/public',
    '/app/public',
  ]);

  const SKIP = new Set(['node_modules', '.git', '.vite', 'src', 'src-tauri']);
  const seen = new Set<string>();
  const queue: string[] = [...roots];
  let depth = 0;
  const MAX_DEPTH = 4;

  // Strict pass first (index.html + assets/), then loose pass (index.html only).
  let looseHit: string | null = null;
  while (queue.length && depth <= MAX_DEPTH) {
    const level: string[] = [];
    while (queue.length) {
      const dir = queue.shift()!;
      if (seen.has(dir)) continue;
      seen.add(dir);
      if (!isDir(dir)) continue;

      if (hasIndex(dir)) {
        if (hasAssets(dir)) return dir;           // strict hit
        if (!looseHit) looseHit = dir;            // remember for loose fallback
      }
      // Enqueue one level of children for the next BFS iteration.
      if (depth < MAX_DEPTH) {
        try {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.')) {
              level.push(path.join(dir, e.name));
            }
          }
        } catch { /* ignore */ }
      }
    }
    for (const d of level) queue.push(d);
    depth++;
  }

  return looseHit;
}
