import { expect, test } from 'bun:test';
import { getBlinkoEndpoint, getSavedEndpoint, isTauriAndEndpointUndefined, saveBlinkoEndpoint } from '../../app/src/lib/blinkoEndpoint';

// 桌面端打进包里的服务器地址来自构建期的 VITE_DESKTOP_ENDPOINT，
// 测试进程里没有这个变量就取不到内建地址，所以在这里显式补上。
// 断言的是「桌面端默认连线上服务」这件事，域名要跟着 tauri.macos.conf.json 走。
process.env.VITE_DESKTOP_ENDPOINT = 'https://studio.baispace.cn';

test('desktop uses built-in server, allows an override, and web stays same-origin', () => {
  const old = globalThis.window;
  const values = new Map<string,string>();
  globalThis.window = { __TAURI__: {}, localStorage: { getItem:(key:string)=>values.get(key)||null, setItem:(key:string,value:string)=>values.set(key,value) }, location:{origin:'http://tauri.localhost'} } as any;
  try {
    expect(getSavedEndpoint()).toBe('https://studio.baispace.cn');
    expect(isTauriAndEndpointUndefined()).toBe(false);
    expect(getBlinkoEndpoint('/api/trpc')).toBe('https://studio.baispace.cn/api/trpc');
    saveBlinkoEndpoint('https://example.com');
    expect(getBlinkoEndpoint('/api/auth/login')).toBe('https://example.com/api/auth/login');
    (window as any).__TAURI__ = undefined;
    expect(getBlinkoEndpoint('/api/trpc')).toBe('http://tauri.localhost/api/trpc');
  } finally { globalThis.window = old; }
});
