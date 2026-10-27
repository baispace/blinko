/**
 * 公开正文里的素材处理。
 *
 * 笔记里的图片都是站内地址（/api/file/*、/api/s3file/*）。
 * 发到公开页有两道要求：
 *
 *   1. 地址里不能带登录凭据 —— 公开快照谁都能读，凭据不能跟着走；
 *   2. 地址指向的文件要能匿名取到 —— 服务端按「公开素材」判定放行。
 *
 * 这里只做纯字符串处理，前后端共用一份口径：
 * 服务端发布时用它改写快照正文，前端渲染时用它判断地址能不能放行。
 */

/** 站内文件地址：/api/file/xxx 或 /api/s3file/xxx。 */
const SITE_FILE_URL = /\/api\/(?:file|s3file)\/[^\s"'<>()[\]`]*/gi;

/** 会泄露凭据的查询参数。 */
const CREDENTIAL_KEYS = ["token", "authorization"];

/** 查询串里的凭据参数：token= / authorization=。 */
const CREDENTIAL_PARAM = new RegExp(
  `(?:^|[?&]|&amp;)(?:${CREDENTIAL_KEYS.join("|")})=`,
  "i",
);

/** 地址是不是站内文件地址。 */
export function isSiteFileUrl(url: string) {
  return /^\/api\/(?:file|s3file)\//i.test((url || "").trim());
}

/**
 * 去掉一个地址里的凭据参数，其余查询参数原样保留。
 *
 * 分隔符可能是 &，也可能是 HTML 实体 &amp; —— 正文里两种都出现过。
 */
export function stripCredentialParams(url: string) {
  const mark = url.indexOf("?");
  if (mark < 0) return url;
  const base = url.slice(0, mark);
  const query = url.slice(mark + 1);
  const parts = query.split(/(&amp;|&)/i);
  const kept: string[] = [];
  // 凭据参数被去掉时，它后面的分隔符也要一起去掉，别留个空参数。
  let dropSeparator = false;
  for (const part of parts) {
    if (!part) continue;
    if (/^(&amp;|&)$/i.test(part)) {
      if (dropSeparator) {
        dropSeparator = false;
        continue;
      }
      kept.push(part);
      continue;
    }
    const key = part.split("=")[0].trim().toLowerCase();
    if (CREDENTIAL_KEYS.includes(key)) {
      dropSeparator = true;
      continue;
    }
    kept.push(part);
  }
  const rest = kept.join("").replace(/(&amp;|&)$/i, "");
  return rest ? `${base}?${rest}` : base;
}

/**
 * 公开正文形态：把站内文件地址里的凭据参数去掉。
 *
 * 只有站内地址会被改写 —— 外链带凭据不悄悄处理，直接挡住（见 hasCredentialLeak）。
 * 改写只作用于写入公开快照的那份正文，正文指纹仍按原文算。
 */
export function rewritePublicBodyAssets(content: string) {
  const source = content ?? "";
  if (!source) return source;
  return source.replace(SITE_FILE_URL, (url) => stripCredentialParams(url));
}

/** 公开正文形态的别名：读起来更像「这份正文公开出去是什么样」。 */
export const publicBodyOf = rewritePublicBodyAssets;

/** 解码 HTML 实体与百分号编码，用来识别伪装过的地址。 */
function decodeForCheck(content: string) {
  let decoded = content.replace(
    /&#(?:x([0-9a-f]+)|(\d+));?/gi,
    (_, hex, dec) =>
      String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)),
  );
  try {
    decoded = decodeURIComponent(decoded);
  } catch {}
  return decoded;
}

/**
 * 正文里是否还有会泄露凭据的链接。
 *
 * 站内文件地址允许带凭据（发布时会剥掉），其它地址带 token 就是泄露：
 * 公开快照会被任何人读到，作者贴进来的密钥不该跟着公开。
 */
export function hasCredentialLeak(content: string) {
  const decoded = decodeForCheck(content ?? "");
  // 站内地址整段抹掉：它们允许带凭据，发布时会剥掉。
  const rest = decoded.replace(SITE_FILE_URL, " ");
  return CREDENTIAL_PARAM.test(rest);
}

/** 正文里引用到的站内文件地址（去重）。 */
export function publicBodyAssetPaths(content: string) {
  const source = content ?? "";
  const paths = new Set<string>();
  for (const match of source.matchAll(SITE_FILE_URL)) {
    const url = match[0];
    const mark = url.indexOf("?");
    paths.add(mark < 0 ? url : url.slice(0, mark));
  }
  return [...paths];
}
