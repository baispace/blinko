#!/usr/bin/env node
/**
 * blinko-sync.js — 把 Blinko 笔记同步为 Hexo 文章（Node 原生无依赖，零 npm 安装）
 *
 * 原理：Blinko 作 Headless CMS → REST API 拉取指定标签的笔记 → 落成 Hexo front-matter 文件
 *
 * 用法：
 *   BLINKO_TOKEN=你的token node blinko-sync.js
 *
 * 环境变量：
 *   BLINKO_HOST    Blinko 地址，默认 http://localhost:1111
 *   BLINKO_TOKEN   Blinko 设置页生成的 Personal Access Token（必填）
 *   BLINKO_TAG     只同步该标签下的笔记（默认 "blog"），天然实现草稿隔离
 *   POSTS_DIR      Hexo 文章目录，默认 ./source/_posts
 *   ASSET_BASE     图片域名前缀，如 https://cdn.example.com（配了 OSS/CDN 必填，否则线上图片 404）
 *   COVER_FIELDS   主题封面字段名，逗号分隔；butterfly: cover,top_img / NexT: images / fluid: index_img
 *   COVER_DEFAULT  兜底封面图
 *   NOTE_TYPE      要发布的笔记类型白名单，默认 "0,1"（0=闪念 1=长文笔记 2=待办）
 *   DRY_RUN        设为 1 只预览要写入/删除的文件，不落盘
 *
 * 关键设计（详见项目记忆）：
 *   - notes.list 只接受 tagId（数字），先经 /tags/list 解析标签名 → id
 *   - 始终排除 type=2(待办) / 归档 / 回收站
 *   - 封面优先级：metadata.coverUrl > 正文显式行「封面:/cover:」 > 正文首图 > COVER_DEFAULT
 *   - 文件名用 note.id，标题改动不影响 URL；内容未变不重写；只清理带 blinko_id 的托管文件
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- 配置 ----------
const HOST = (process.env.BLINKO_HOST || 'http://localhost:1111').replace(/\/+$/, '');
const TOKEN = process.env.BLINKO_TOKEN || '';
const TAG = process.env.BLINKO_TAG || 'blog';
const POSTS_DIR = process.env.POSTS_DIR || path.join(process.cwd(), 'source', '_posts');
const ASSET_BASE = (process.env.ASSET_BASE || '').replace(/\/+$/, '');
const COVER_DEFAULT = process.env.COVER_DEFAULT || '';
const COVER_FIELDS = (process.env.COVER_FIELDS || 'cover,top_img').split(',').map(s => s.trim()).filter(Boolean);
const NOTE_TYPE = (process.env.NOTE_TYPE || '0,1').split(',').map(Number);
const DRY_RUN = process.env.DRY_RUN === '1';
const PAGE_SIZE = 50;

if (!TOKEN) {
  console.error('[blinko-sync] 缺少 BLINKO_TOKEN（Blinko 设置 → 个人令牌）');
  process.exit(1);
}

async function api(method, pathname, body) {
  const res = await fetch(`${HOST}/api/v1${pathname}`, {
    method,
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Blinko API ${pathname} 失败: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

function pickItems(payload) {
  if (Array.isArray(payload)) return payload;
  return payload.items || payload.data || payload.notes || [];
}

// ---------- 1. 标签名 → tagId（notes.list 只认数字 id） ----------
async function resolveTagId(tagName) {
  const payload = await api('GET', '/tags/list');
  const list = pickItems(payload);
  const nameOf = (t) => (t && typeof t === 'object') ? (t.name || (t.tag && t.tag.name)) : t;
  const hit = list.find((t) => nameOf(t) === tagName);
  if (!hit) {
    throw new Error(`找不到标签 #${tagName}。现有标签: ${list.map(nameOf).filter(Boolean).join(', ') || '(无)'}`);
  }
  const id = hit.id != null ? hit.id : (hit.tag && hit.tag.id);
  if (id == null) throw new Error(`标签 #${tagName} 返回结构异常: ${JSON.stringify(hit).slice(0, 120)}`);
  return id;
}

// ---------- 2. 分页拉取 ----------
async function fetchAllNotes(tagId) {
  const all = [];
  for (let page = 1; ; page++) {
    const payload = await api('POST', '/note/list', { tagId, page, size: PAGE_SIZE, orderBy: 'desc' });
    const items = pickItems(payload);
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
    if (page > 100) break; // 保险丝
  }
  return all;
}

// ---------- 3. 发布过滤 ----------
function isPublishable(n) {
  if (n.isArchived || n.isRecycle || n.deleted) return false;
  if (!NOTE_TYPE.includes(Number(n.type ?? 1))) return false;
  return true;
}

// ---------- 4. 标题 / 标签 ----------
function deriveTitle(note) {
  const firstLine = (note.content || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const heading = firstLine.match(/^#{1,6}\s+(.+)$/);
  const raw = (heading ? heading[1] : firstLine)
    .replace(/[#*`>_[\]!()]/g, '')
    .trim();
  return (raw || String(note.id)).slice(0, 80);
}

function stripLeadingTitle(content, title) {
  const lines = String(content || '').replace(/^\s*\n/, '').split('\n');
  const first = (lines[0] || '').trim();
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^#{1,6}\\s+${esc}\\s*$`).test(first) || first === title) lines.shift();
  return lines.join('\n').replace(/^\s*\n/, '');
}

function tagNames(note) {
  if (!Array.isArray(note.tags)) return [];
  return note.tags
    .map((t) => (typeof t === 'string' ? t : (t.name || (t.tag && t.tag.name) || '')))
    .filter(Boolean);
}

// ---------- 5. 图片路径补全（配了 ASSET_BASE → CDN，否则退回 Blinko 本身） ----------
function toAbsoluteAssetUrl(url) {
  if (!url) return url;
  if (/^(https?:)?\/\//i.test(url)) return url;
  const base = ASSET_BASE || HOST;
  return url.startsWith('/') ? base + url : `${base}/${url}`;
}

function rewriteAssets(content) {
  return String(content).replace(
    /(!\[[^\]]*\]\()([^)\s]+)([^)]*\))/g,
    (m, pre, url, post) => /^(https?:)?\/\//i.test(url) ? m : pre + toAbsoluteAssetUrl(url) + post,
  );
}

// ---------- 6. 封面：metadata.coverUrl > 显式行 > 首图 > 兜底 ----------
function resolveCover(note) {
  const meta = note.metadata;
  if (meta && typeof meta === 'object' && meta.coverUrl) {
    return { cover: toAbsoluteAssetUrl(meta.coverUrl), content: note.content || '' };
  }
  let body = note.content || '';
  let cover = '';
  const explicit = body.match(/^[ \t]*[-*]?[ \t]*(?:封面|cover)[ \t]*[:：][ \t]*(.+)$/im);
  if (explicit) {
    const raw = explicit[1].trim();
    const mdImg = raw.match(/!\[[^\]]*\]\(([^)]+)\)/);
    cover = mdImg ? mdImg[1].trim() : raw.replace(/^<|>$/g, '').trim();
    body = body.replace(explicit[0], '');
  }
  if (!cover) {
    const withoutCode = body.replace(/```[\s\S]*?```/g, '');
    const img = withoutCode.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
    if (img) cover = img[1].trim();
  }
  if (!cover) cover = COVER_DEFAULT;
  return { cover: cover ? toAbsoluteAssetUrl(cover) : '', content: body };
}

// ---------- 7. front-matter 渲染 ----------
function yamlStr(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function coverFrontMatter(cover) {
  if (!cover) return [];
  if (COVER_FIELDS.includes('images')) {
    return [`images:`, `  - ${yamlStr(cover)}`]; // NexT 用数组
  }
  return COVER_FIELDS.map((f) => `${f}: ${yamlStr(cover)}`);
}

function renderPost(note) {
  const title = deriveTitle(note);
  const { cover, content: noCoverLine } = resolveCover(note);
  const body = rewriteAssets(stripLeadingTitle(noCoverLine, title));
  const tags = tagNames(note).filter((t) => t !== TAG);
  const date = note.createdAt || note.created_at || new Date().toISOString();
  const updated = note.updatedAt || note.updated_at || date;

  const fm = [
    '---',
    `title: ${yamlStr(title)}`,
    `date: ${new Date(date).toISOString()}`,
    `updated: ${new Date(updated).toISOString()}`,
    ...coverFrontMatter(cover),
    `tags: [${tags.map(yamlStr).join(', ')}]`,
    `blinko_id: ${yamlStr(note.id)}`,
    '---',
    '',
  ].join('\n');

  return `${fm}\n${body.trim()}\n`;
}

// ---------- main ----------
(async () => {
  console.log(`[blinko-sync] 目标: ${HOST}  标签: #${TAG}${DRY_RUN ? '（dry-run 预览）' : ''}`);

  const tagId = await resolveTagId(TAG);
  const notes = (await fetchAllNotes(tagId)).filter(isPublishable);
  console.log(`[blinko-sync] 标签解析为 tagId=${tagId}，命中 ${notes.length} 篇可发布笔记`);
  if (notes.length === 0) process.exit(0);

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  const keep = new Set();
  let changed = 0;

  for (const note of notes) {
    const name = `${note.id}.md`;
    keep.add(name);
    const md = renderPost(note);
    const file = path.join(POSTS_DIR, name);
    const unchanged = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === md;
    if (unchanged) continue;
    changed++;
    if (DRY_RUN) console.log(`  [将写入] ${name} — ${deriveTitle(note)}`);
    else { fs.writeFileSync(file, md); console.log(`  [已写入] ${name} — ${deriveTitle(note)}`); }
  }

  // 清理：只删带 blinko_id 的托管文件，绝不碰手写文章
  for (const f of fs.readdirSync(POSTS_DIR)) {
    if (!f.endsWith('.md') || keep.has(f)) continue;
    const p = path.join(POSTS_DIR, f);
    const head = fs.readFileSync(p, 'utf8').slice(0, 600);
    if (!head.includes('blinko_id:')) continue;
    changed++;
    if (DRY_RUN) console.log(`  [将删除] ${f}（已不在发布标签下）`);
    else { fs.unlinkSync(p); console.log(`  [已删除] ${f}`); }
  }

  console.log(`[blinko-sync] 完成，变更 ${changed} 个文件${DRY_RUN ? '（未落盘）' : ''}`);
})().catch((e) => {
  console.error(`[blinko-sync] 失败: ${e.message}`);
  process.exit(1);
});
