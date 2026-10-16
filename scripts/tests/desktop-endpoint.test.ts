import { expect, test } from 'bun:test';
import { getBlinkoEndpoint, getSavedEndpoint, isTauriAndEndpointUndefined, saveBlinkoEndpoint } from '../../app/src/lib/blinkoEndpoint';

test('desktop uses built-in server, allows an override, and web stays same-origin', () => {
  const old = globalThis.window;
  const values = new Map<string,string>();
  globalThis.window = { __TAURI__: {}, localStorage: { getItem:(key:string)=>values.get(key)||null, setItem:(key:string,value:string)=>values.set(key,value) }, location:{origin:'http://tauri.localhost'} } as any;
  try {
    expect(getSavedEndpoint()).toBe('https://ink.baispace.cn');
    expect(isTauriAndEndpointUndefined()).toBe(false);
    expect(getBlinkoEndpoint('/api/trpc')).toBe('https://ink.baispace.cn/api/trpc');
    saveBlinkoEndpoint('https://example.com');
    expect(getBlinkoEndpoint('/api/auth/login')).toBe('https://example.com/api/auth/login');
    (window as any).__TAURI__ = undefined;
    expect(getBlinkoEndpoint('/api/trpc')).toBe('http://tauri.localhost/api/trpc');
  } finally { globalThis.window = old; }
});
