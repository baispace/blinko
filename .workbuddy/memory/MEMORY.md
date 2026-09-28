# Blinko 项目长期笔记

## 本地研发环境
- 单端口架构：Express + ViteExpress，端口 **1111**；后端 `bun run dev:backend`（bun --watch 自动重启）
- **本地唯一启动命令**：`cd /Users/baihe/blinko/app && ~/.bun/bin/bun run dev`
  （app/package.json 的 `dev` = `cd ../server && bun run dev`，后端再起 Vite，所以只跑这一条）
- bun 在 `~/.bun/bin/bun`（不在 PATH，需绝对路径）
- 服务已在跑时不要重复起；`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1111/health` 探活，200 即可用
- 一键脚本：`.workbuddy/outputs/blinko-deploy/dev-local.sh`（探活 → 未起则拉起并等就绪）
- 代码改动**无需重启**：前端 Vite HMR、后端 bun --watch
- 数据库：PostgreSQL 本地 `postgresql://baihe@localhost:5432/blinko`
- 页面背景 `--heo-background:#f7f9fe`、主色 `--heo-main:#7454fc`（HEO 风格参考 blog.zhheo.com）
- 注意：DB `config.themeColor` 会**覆盖**代码里的默认主色，改主题色需同步 DB

## 关键约定与坑
- **dayjs**：统一从 `@/lib/dayjs` 导入。新增格式符前先确认插件已在 `app/src/lib/dayjs.ts` 注册。
  已注册：utc / timezone / relativeTime / isoWeek。`WW`（ISO 周）依赖 isoWeek；`ww`（周数）依赖 weekOfYear。
  漏注册的表现是运行时 `TypeError: xxx is not a function` → React 整树白屏。
- **config 语义**（`shared/lib/types.ts`）：
  - `ZUserPerferConfigKey` = **用户级**配置（带 userId），`getGlobalConfig` 要求 `item.userId === 当前 userId` 才返回
  - `ZConfigKey` = 全局配置
  - 新增配置项需同时补 `ZConfigSchema`（字段）与对应 key 白名单，否则读不到
- **tRPC 探测**：query 用 GET、mutation 用 POST；向 query 发 POST 返回 405 METHOD_NOT_SUPPORTED（属正常响应，可用于探活）
- **类型检查**：在 `app/` 下跑 `NODE_OPTIONS="--max-old-space-size=8192" bunx tsc --noEmit -p tsconfig.json`
  约 **2m15s** 完成（不加内存参数会在 ~1m35s 时 V8 OOM 打栈转储）。**app/ + server 共有 54 个既有类型错误**
  （server 侧 TS2589/pgBoss、ShareDialog、McpServers、framer-motion variants、pages/index 等），
  所以正确做法是**只看日志里是否出现你改动的文件名**，不追求零报错：
  `tsc ... > /tmp/tsc.log 2>&1; grep "error TS" /tmp/tsc.log | grep -v "\.\./server"`

## 笔记封面 + 图标（全部走 notes.metadata，不改库不加接口）
- 存 `metadata.icon`（emoji）、`metadata.cover`、`metadata.coverOffset`；`notes.metadata` 是 `Json?` 且 upsert 会 merge
- `metadata.cover` 二态：`cover:cover-N`（图库键）或真实上传路径；`toCoverUrl()` 统一解析
- 图库是 **12 张程序生成 SVG data URI**（`NoteCover/defaultCovers.ts`）：零请求、可离线
- **封面比例是 2.35:1**（对齐飞书云文档底图 2000×400），不是 16:9
- **取景 offset 用 `object-position: x% y%` 一行 style 实现**，不需要额外 DOM / transform 数学；
  拖动时按 frame rect 把鼠标位置映到 0-100（图片跟手）；**飞书方案改为内联拖拽**：在编辑页封面区域直接拖，所见即所得，实时写 store（`requestAnimationFrame` 节流），按 Esc 或点「完成」退出
- 新增 `NoteCover/coverOffset.ts`：`normalizeOffset` 容错缺失/旧值，缺失回落 50/50（向后兼容）
- 新增 `NoteCover/CoverAdjust.tsx`：内联取景组件；`CoverPicker` 弹窗里去掉「调整图片位置」Tab，只保留图库/上传/移除
- **本地存储封面图必须带 token query**：`/api/file/...` 需要鉴权，`<img>` 发不了 `Authorization` header；
  后端 `getTokenFromRequest` 已支持 `?token=`，所以渲染时用 `toAuthenticatedCoverUrl()` 拼上 `localStorage.blinkoToken.token`，
  否则上传成功后封面显示裂图

## 无密码复用登录态（前端验证必备）
本地只有 admin 一个账号且密码未知时，用 DB 里的 JWT 直接注入浏览器：
```bash
TOKEN=$(psql postgresql://baihe@localhost:5432/blinko -t -A -c 'SELECT "apiToken" FROM accounts WHERE id=1;')
# 浏览器内：
localStorage.setItem('blinkoToken', JSON.stringify({token:'<JWT>', user:{id:'1', name:'admin'}}))
```
- 前端存储 key：`localStorage.blinkoToken`（StorageState），值结构 `{token, user, requiresTwoFactor?}`
- 路由守卫要求 `tokenData.user.id` 存在，否则跳 /signin
- apiToken 可直接作 `Authorization: Bearer <JWT>` 调 tRPC 接口

## 前端白屏排查顺序
1. `curl` 关键模块看 HTTP 状态码（200 = 编译通过）
   - **注意**：本地是 ViteExpress 单端口架构，`/app/src/...` 会被 SPA fallback 成 HTML，
     必须验 `/src/...`（如 `/src/components/Common/Editor/NoteCover/index.tsx`）
     返回的是 Vite 转译后的 JS，不是 `<!doctype html>`
2. 看 `/signin` 能否渲染 → 能则为「登录后渲染期」错误（非模块图问题）
3. 检查 `document.querySelector('vite-error-overlay')`
4. 注入 token 复现登录态，用 agent-browser eval 看 `location.pathname` / `root.innerHTML.length`

## agent-browser 自动化技巧（本项目实测有效）
- React Aria Popover（HeroUI trigger）对 `.click()` 无响应 → eval 派发完整事件序列：
  pointerdown/pointerup/mousedown/mouseup/click（带 clientX/Y/pointerId/bubbles）
- 普通 onClick 的 div 用 `.click()` 即可；复杂图标按钮用 svg path d 前缀定位
- eval 变量跨调用残留（`Identifier already declared`）→ 全部 IIFE 包裹
- 编辑器 store 直读：Card 元素挂了 `__storeInstance`（`[...document.querySelectorAll('div')].find(d => d.__storeInstance)`）
- Tiptap 注意：失焦后 focus() 恢复上次选区——全选状态下经 Popover 插入会替换选区（惯例语义非 bug）

## Tiptap 编辑器（已替换 Vditor，适配器冒充 vditor 接口）
- 代码在 `app/src/components/Common/Editor/Tiptap/`：adapter/extensions/ToolbarButtons/Callout/CalloutIconMenu/tiptap.css
- **Callout（高亮块）**：自研 Node 扩展，markdown 以 HTML 块保真存储
  `<div data-callout-type="warning" data-callout-icon="📌" data-type="callout"><p>...</p></div>`
- 颜色（type）与图标（icon）两个独立 attr；icon 为 null 时 renderHTML 按 type 回退默认 emoji
- emoji 显示用 CSS `content: attr(data-callout-icon)`（编辑端 tiptap.css `.tiptap` + 查看端 github-markdown.css `.markdown-body` **两处都要改**）
- 查看端卡片走 react-markdown + rehypeRaw 渲染 HTML；命令用 wrapIn/lift 实现 toggle（setNode 对 block 容器无效）
- **Callout 交互**：CalloutClickOutside 插件（点下方空白补段落 + 点击图标区派发 callout-icon-click 事件）；CalloutIconMenu 浮动面板；Enter 空尾块跳出 / Backspace 开头 lift
- **任务清单删除线**：MarkdownRender 的 ListItem 检测 checked 必须递归找 input（loose list 时 input 在 `<p>` 内，直接 find 拿不到）
- **表格（飞书手感，2026-09-28 落地）**：`Tiptap/tableExtension.ts`（resizable + preserveHtml + 覆盖 markdown serialize）、
  `tableUtils.ts`（moveRow/moveColumn = delete+insert + `tr.mapping.map`）、`TableToolbar.tsx`、`TableHandles.tsx`
  - 存储策略「按需 HTML 化」：普通表仍是 GFM 管道表；一旦出现合并/列宽/对齐/底色，`TablePreserveHtml`
    插件自动置 `preserveHtml` → 整表序列化为 HTML `<table>`（查看端 rehypeRaw 渲染，样式在 github-markdown.css）
  - 坑：`@tiptap/pm/tables` 只导出 CellSelection，TextSelection 要从 `@tiptap/pm/state` 导入；
    单元格多 attr 必须在 renderHTML 里合并成一条 style，否则互相覆盖

## 本地测 AI 功能的前置条件
- 本地 `aiProviders` / `aiModels` 表**是空的** → 任何 AI 调用都会失败，
  斜杠菜单的 `/ai 扩写`、`/ai 润色`、工具栏羽毛笔全都不会出结果
- 必须在 **设置 → AI模型** 里先配 provider（填 baseURL / apiKey）并加一个模型，
  还要有 `mainModelId` 全局配置（AiModelFactory.ValidConfig 会抛 "Main AI model not configured!"）
- `aiProviders` 表结构：`id,title,provider,baseURL,apiKey,config(json),sortOrder,createdAt,updatedAt`

## 容器启动脚本 start.sh（dockerfile CMD 走它）
- 容器 `WORKDIR=/app`，**脚本里任何 `cd` 都会污染后续所有相对路径命令** →
  曾因预压缩段 `cd /app/server/public` 没切回，导致 `node server/index.js`
  被解析成 `/app/server/public/server/index.js` → MODULE_NOT_FOUND → 容器 crash-loop → 全站 502
- **不要 shell 出到 `gzip`**：node:20-alpine 的 busybox 不保证有 gzip，
  且 `gzip ... > "$1.gz" || true` 在命令缺失时仍会留下**空 .gz**，污染 servePrecompressed 的缓存校验。
  改用 `node -e` + zlib（必然可用），先写 `.gz.tmp` 再 rename
- 预压缩文件由 `servePrecompressed()`（server/index.ts，置于 express.static 之前）直接吐给客户端
- 日志里看到「Pre-compressing… → Cannot find module '/app/server/public/server/index.js'」
  = 又是 cd 泄漏，10 秒内定位

## 诊断：全站 502 的上游原因定位链
1. 先确认是不是静态资源也 502（是 → 不是前端问题，是 upstream 挂了）
2. 连续采样 30s+ 仍全 502 → 排除"启动中"的临时状态
3. 直接看 `docker compose logs` 最后几行，Node 的 MODULE_NOT_FOUND / EADDRINUSE 会重复刷屏
4. 502 = Nginx `proxy_pass` 到 `127.0.0.1:1111` 时 upstream 无响应，**跟接口慢/前端无关**
5. **ghcr.io/baispace/blinko 匿名不可列 tag**（`/v2/.../tags/list` 返回 401）→ 没法靠切旧 tag 回滚，只能重推重建

## 图标体系（本地与线上站点是两套，勿混用）
- **本地仓库代码（旧版）**：`app/src/components/Common/Iconify/icons.tsx`，由 `buildIcons.js` 扫描生成，
  打包 46 个 Iconify 集合（hugeicons / solar / tabler / lucide / mingcute …），缺失时 fallback 到 `@iconify/react` 在线渲染。
  用法 `<Icon icon="lucide:maximize" />`。改图标后需跑 `bun run build:iconify:icons` 重新生成。
- **线上站点 app.blinko.space（新版）**：已换为 **Iconly**（Light-Outline）统一图标库，
  任意 Iconify 名 → 归一化为 Iconly 图标（三层映射：导航 7 / 语义 96 / 品牌 25 + 关键词降级函数）。
  静态 `assets/iconly/flat/*.svg`（132 个，懒加载）+ Lottie 动画 `assets/iconly/{actions,ai,waiting}/*.json`（83 个），依赖 `lottie-web`。
  站点已提取产物（含 83 个标准 Lottie JSON + 22 个内联 SVG + 总览页）→ `.workbuddy/outputs/blinko-icons/`

## 资源模块文件夹模型（虚拟文件夹，2026-09-28 确认）
- `attachments.createFolder`（server/routerTrpc/attachment.ts）**只在 DB 插占位记录**：name='.folder'、type='folder'、path=`/api/file/{parent}/{name}/.folder`、perfixPath=`parent,name`（逗号分隔）
  → 不 mkdir、不在 OSS 建任何对象
- 列表里的文件夹是 SQL 从 `perfixPath` 用 `split_part` **虚拟推导**（DISTINCT ON folder_name），不是读文件系统
- 真实目录只在**上传时**产生：`uploadFileStream(stream,{folder})` 拼 `folderPrefix` → 本地 `fs.mkdir(dirname,{recursive:true})`；S3 模式只是 key 前缀（对象存储无目录概念），上传后 `createAttachment` 从 path 反推 perfixPath
- 前端 resources.tsx 过滤 `name !== '.folder'` 隐藏占位记录
- 不一致点：create 纯虚拟；**rename/delete 会真实操作存储**（`FileService.moveFile` / `deleteFile`）
- 坑：占位记录 path 写死 `/api/file/` 前缀，S3 模式下进入该文件夹上传的文件是 `/api/s3file/`，SQL 的 `CASE WHEN path LIKE '/api/s3file/%'` 可能取到占位行 → 前缀判断不准（仅影响文件夹项 path，暂无功能影响）
