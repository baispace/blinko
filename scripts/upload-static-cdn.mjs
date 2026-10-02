#!/usr/bin/env bun
/**
 * 静态资源 CDN 直传脚本（绕过站点 UI）
 * --------------------------------------------------------------------------
 * 适用场景：站点因 CDN 缺静态文件白屏、无法在「设置 → 静态资源 CDN」里点击
 *          上传按钮时的破局工具。直接把构建产物（server/public 下的
 *          assets/fonts/icons/locales）推到 OSS，完全不经过前端页面。
 *
 * OSS key 规则与线上 rewrite 严格对齐（见 shared/lib/pathConstant.ts）：
 *   key = keyPrefix(cdnPath) + 相对路径
 *   其中 keyPrefix 在 cdnPath 为保留名(assets/fonts/icons/locales)时为空，
 *   否则为 `cdnPath/`。
 *
 * 用法（推荐走环境变量，避免命令行泄露密钥）：
 *   S3_ENDPOINT=https://oss-cn-xxx.aliyuncs.com \
 *   S3_REGION=cn-xxx \
 *   S3_BUCKET=blinko \
 *   S3_ACCESS_KEY_ID=AK... \
 *   S3_ACCESS_KEY_SECRET=... \
 *   STATIC_CDN_PATH= \   # 留空即可；若线上填了非保留名命名空间则填它
 *   bun scripts/upload-static-cdn.mjs --dir server/public
 *
 * 也可显式传参覆盖：
 *   bun scripts/upload-static-cdn.mjs --dir server/public \
 *     --endpoint https://oss-cn-xxx.aliyuncs.com --region cn-xxx \
 *     --bucket blinko --access-key-id AK... --access-key-secret ... [--cdn-path ""]
 */

import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ---------- 参数解析 ----------
function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const dir = args.dir || 'server/public';

const S3_ENDPOINT = args.endpoint || process.env.S3_ENDPOINT || '';
const S3_REGION = args.region || process.env.S3_REGION || '';
const S3_BUCKET = args.bucket || process.env.S3_BUCKET || '';
const S3_ACCESS_KEY_ID = args['access-key-id'] || process.env.S3_ACCESS_KEY_ID || '';
const S3_ACCESS_KEY_SECRET = args['access-key-secret'] || process.env.S3_ACCESS_KEY_SECRET || '';
const STATIC_CDN_PATH = args['cdn-path'] !== undefined ? args['cdn-path'] : (process.env.STATIC_CDN_PATH || '');

// ---------- key 规则（对齐 pathConstant.ts） ----------
const RESERVED_DIRS = ['assets', 'fonts', 'icons', 'locales'];
const CDN_DIRS = ['assets', 'fonts', 'icons', 'locales'];

function buildKeyPrefix(cdnPath) {
  const p = (cdnPath || '').trim().replace(/^\/+|\/+$/g, '');
  if (!p) return '';
  if (RESERVED_DIRS.includes(p)) return ''; // 保留名视为无前缀
  return p + '/';
}
const keyPrefix = buildKeyPrefix(STATIC_CDN_PATH);

// ---------- 校验 ----------
if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_ACCESS_KEY_SECRET) {
  console.error('缺少 OSS 配置。请通过环境变量或 --参数 提供：S3_ENDPOINT / S3_REGION / S3_BUCKET / S3_ACCESS_KEY_ID / S3_ACCESS_KEY_SECRET');
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  console.error(`目录不存在：${dir}（请用 --dir 指定构建产物目录，例如 server/public 或 dist/public）`);
  process.exit(1);
}

// ---------- MIME ----------
const MIME = {
  '.js': 'application/javascript', '.mjs': 'application/javascript', '.cjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.html': 'text/html', '.txt': 'text/plain', '.xml': 'application/xml', '.map': 'application/json'
};

// ---------- 收集文件 ----------
async function walk(d, rel, out) {
  const entries = await fs.promises.readdir(d, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(d, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (rel === '' && !CDN_DIRS.includes(e.name)) continue; // 顶层只进 4 个目录
      await walk(full, r, out);
    } else {
      if (rel === '' && !CDN_DIRS.includes(e.name)) continue;
      out.push({ full, r });
    }
  }
}

const files = [];
await walk(dir, '', files);
if (files.length === 0) {
  console.error(`在 ${dir} 下未找到 assets/fonts/icons/locales 静态文件，请确认 --dir 指向正确的构建产物目录。`);
  process.exit(1);
}

// ---------- 构造 S3 客户端 ----------
const endpointRaw = S3_ENDPOINT.trim();
const endpoint = endpointRaw && !/^https?:\/\//i.test(endpointRaw) ? `https://${endpointRaw}` : endpointRaw;
const client = new S3Client({
  endpoint,
  region: S3_REGION,
  credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_ACCESS_KEY_SECRET },
  // 阿里云 OSS 仅接受虚拟主机风格；其余 S3 兼容存储用 path-style
  forcePathStyle: !/aliyuncs\.com/i.test(endpoint || ''),
});

// ---------- 上传 ----------
console.log(`开始上传：目录=${dir}  文件数=${files.length}  keyPrefix="${keyPrefix}"  bucket=${S3_BUCKET}`);
let done = 0, failed = 0;
const t0 = Date.now();

for (const f of files) {
  const key = keyPrefix + f.r;
  const ext = path.extname(f.full).toLowerCase();
  const body = await fs.promises.readFile(f.full);
  try {
    await client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: MIME[ext] || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    done++;
    if (done % 20 === 0 || done === files.length) {
      console.log(`  [${done}/${files.length}] 已上传 ${key}`);
    }
  } catch (err) {
    failed++;
    console.error(`  ✗ 失败 ${key}: ${err.message}`);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n完成：成功 ${done}，失败 ${failed}，耗时 ${secs}s`);
if (failed > 0) process.exit(2);
