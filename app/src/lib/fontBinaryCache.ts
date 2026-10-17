/**
 * 字体二进制缓存（IndexedDB）
 *
 * 目的：让「上次选中的字体」在刷新后不必重新走 `api.fonts.getFontData` 的网络往返。
 * 首屏时 `index.html` 的内联脚本已经套上了正确的 font-family（见 fontPreference.ts），
 * 这里负责把字形本身尽早灌进 `document.fonts`，配合 `font-display: optional` 就能
 * 消掉刷新时的字体跳变。
 *
 * 为什么用 IndexedDB 而不是 localStorage：字体动辄几 MB，localStorage 只有 ~5MB
 * 配额而且是同步 API，读一次会阻塞主线程。
 *
 * 所有失败都静默降级：缓存只是加速手段，拿不到就回落到原有网络加载路径。
 */

const DB_NAME = 'ink-font-binaries';
const DB_VERSION = 1;
const STORE_NAME = 'binaries';

export interface CachedFontBinary {
  name: string;
  /** 原始字体字节 */
  buffer: ArrayBuffer;
  /** woff2 / woff / ttf / otf */
  format: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    // SSR / 老浏览器 / 隐私模式下 indexedDB 可能不存在
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

/** 读缓存的字体二进制；没有缓存或读取失败时返回 null。 */
export async function readCachedFontBinary(name: string): Promise<CachedFontBinary | null> {
  try {
    const db = await openDB();
    if (!db) return null;

    return await new Promise<CachedFontBinary | null>((resolve) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE_NAME, 'readonly');
      } catch {
        resolve(null);
        return;
      }
      const req = tx.objectStore(STORE_NAME).get(name);
      req.onsuccess = () => {
        const value = req.result as CachedFontBinary | undefined;
        if (!value || !value.buffer) {
          resolve(null);
          return;
        }
        // 存进来的是 ArrayBuffer，取出来时可能已经被结构化克隆成别的类型
        const buffer =
          value.buffer instanceof ArrayBuffer
            ? value.buffer
            : (value.buffer as ArrayBufferLike & { buffer?: ArrayBuffer }).buffer;
        resolve(buffer ? { name: value.name, buffer, format: value.format } : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 写入缓存；失败不影响功能，忽略即可。 */
export async function writeCachedFontBinary(name: string, buffer: ArrayBuffer, format: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db) return;

    await new Promise<void>((resolve) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE_NAME, 'readwrite');
      } catch {
        resolve();
        return;
      }
      tx.objectStore(STORE_NAME).put({ name, buffer, format } satisfies CachedFontBinary);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // 配额不足 / 隐私模式：静默放弃缓存
  }
}

/** 删掉某个字体的缓存（用户换字体、字体被移除时调用）。 */
export async function deleteCachedFontBinary(name: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db) return;

    await new Promise<void>((resolve) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE_NAME, 'readwrite');
      } catch {
        resolve();
        return;
      }
      tx.objectStore(STORE_NAME).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // 同上
  }
}
