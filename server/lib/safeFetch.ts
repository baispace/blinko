import dns from "node:dns/promises";
import net from "node:net";

/**
 * 站点检查用的安全 HTTP 客户端。
 *
 * 服务端会按用户填写的目标地址发起请求，所以必须防 SSRF：
 * 只允许 http(s)，解析域名后拒绝回环与内网地址，重定向逐跳复检，
 * 并限制超时与响应体积。这里不是通用代理 —— 调用方只会请求固定路径。
 */

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 512 * 1024;

export class SafeFetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid-url"
      | "blocked-host"
      | "dns-failed"
      | "timeout"
      | "too-large"
      | "network",
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

function ipv4ToInt(ip: string) {
  return ip
    .split(".")
    .map((part) => Number(part))
    .reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

const IPV4_BLOCKED: [string, number, number][] = [
  ["0.0.0.0", 8, 0x00000000],
  ["10.0.0.0", 8, 0x0a000000],
  ["100.64.0.0", 10, 0x64400000],
  ["127.0.0.0", 8, 0x7f000000],
  ["169.254.0.0", 16, 0xa9fe0000],
  ["172.16.0.0", 12, 0xac100000],
  ["192.0.0.0", 24, 0xc0000000],
  ["192.0.2.0", 24, 0xc0000200],
  ["192.168.0.0", 16, 0xc0a80000],
  ["198.18.0.0", 15, 0xc6120000],
  ["198.51.100.0", 24, 0xc6336400],
  ["203.0.113.0", 24, 0xcb007100],
  ["224.0.0.0", 4, 0xe0000000],
  ["240.0.0.0", 4, 0xf0000000],
];

/** 判断一个 IP 是否属于回环、内网、链路本地或保留网段。 */
export function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const value = ipv4ToInt(ip);
    for (const [, bits, network] of IPV4_BLOCKED) {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((value & mask) >>> 0 === (network & mask) >>> 0) return true;
    }
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    // IPv4 映射地址（::ffff:127.0.0.1）按内嵌的 IPv4 判断。
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb"))
      return true;
    if (lower.startsWith("ff")) return true;
    if (lower.startsWith("64:ff9b:")) return true;
    return false;
  }
  return true;
}

/**
 * 校验目标地址是否可以安全请求。
 *
 * 域名要先解析再判断 —— 直接看字符串挡不住指向内网的 DNS。
 */
export async function assertPublicTarget(rawUrl: string, allowSelfOrigin = "") {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("地址格式不正确", "invalid-url");
  }
  if (!/^https?:$/.test(url.protocol))
    throw new SafeFetchError("只允许 http(s) 协议", "invalid-url");
  if (url.username || url.password)
    throw new SafeFetchError("地址不能包含用户名或密码", "invalid-url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new SafeFetchError("缺少主机名", "invalid-url");
  // 唯一豁免：指向本服务自己（站点检查需要能检查本机站点）。
  // 只认完全一致的 origin，端口不同一律不放行，避免变成内网端口扫描。
  if (allowSelfOrigin && url.origin === allowSelfOrigin) return url;
  if (net.isIP(host)) {
    if (isPrivateAddress(host))
      throw new SafeFetchError("目标指向回环或内网地址，已拒绝请求", "blocked-host");
    return url;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
    throw new SafeFetchError("目标指向本机地址，已拒绝请求", "blocked-host");
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new SafeFetchError("域名解析失败", "dns-failed");
  }
  if (!addresses.length)
    throw new SafeFetchError("域名没有解析到任何地址", "dns-failed");
  if (addresses.some((a) => isPrivateAddress(a.address)))
    throw new SafeFetchError(
      "目标解析到回环或内网地址，已拒绝请求",
      "blocked-host",
    );
  return url;
}

export type SafeFetchResult = {
  ok: boolean;
  status: number;
  headers: Headers;
  body: string;
  /** 最终落地的地址（跟随重定向后） */
  finalUrl: string;
  /** 失败时的原因说明 */
  error?: string;
  errorCode?: SafeFetchError["code"];
  /** 响应体是否因为体积上限被截断 */
  truncated?: boolean;
};

async function readLimited(response: Response) {
  const body = response.body;
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      chunks.push(value.slice(0, Math.max(0, value.byteLength - (size - MAX_BODY_BYTES))));
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged), truncated };
}

/**
 * 发起一次受控请求。
 *
 * 重定向不交给 fetch 自动跟随 —— 每一跳都要重新做内网校验，
 * 否则 http://evil.com → http://127.0.0.1 就是一条绕过路径。
 */
export async function safeFetch(
  rawUrl: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxRedirects?: number;
    /** 本服务自己的 origin：只有完全一致的地址可以绕过内网拦截。 */
    allowSelfOrigin?: string;
  } = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  let current = rawUrl;
  let redirects = 0;
  while (true) {
    let url: URL;
    try {
      url = await assertPublicTarget(current, options.allowSelfOrigin);
    } catch (error) {
      const e = error as SafeFetchError;
      return {
        ok: false,
        status: 0,
        headers: new Headers(),
        body: "",
        finalUrl: current,
        error: e.message,
        errorCode: e.code,
      };
    }
    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        const location = response.headers.get("location")!;
        const next = new URL(location, url).href;
        if (redirects >= maxRedirects) {
          return {
            ok: false,
            status: response.status,
            headers: response.headers,
            body: "",
            finalUrl: next,
            error: "重定向次数过多",
            errorCode: "network",
          };
        }
        redirects += 1;
        current = next;
        continue;
      }
      const { text, truncated } = await readLimited(response);
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        body: text,
        finalUrl: url.href,
        truncated,
      };
    } catch (error) {
      const message = (error as Error)?.message || "请求失败";
      const isTimeout =
        message.includes("timeout") || message.includes("Timeout") ||
        (error as Error)?.name === "TimeoutError";
      return {
        ok: false,
        status: 0,
        headers: new Headers(),
        body: "",
        finalUrl: current,
        error: isTimeout ? `请求超时（${timeoutMs}ms）` : message,
        errorCode: isTimeout ? "timeout" : "network",
      };
    }
  }
}
