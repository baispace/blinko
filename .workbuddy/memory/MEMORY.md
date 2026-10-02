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
- **z-index 层级铁律**：全屏编辑层是 `fixed inset-0 z-[9999]`（FullscreenEditor + isFullscreen Card）；
  任何 portal 弹窗/浮层 wrapper 必须 **> 9999**（CoverPicker/IconPicker 现为 z-[10000]），
  否则弹窗渲染成功但被全屏层盖住 = 用户视角"点击无反应"。
  排查口诀：先 `elementFromPoint(视口中心)` 看被谁盖住，别先怀疑事件没触发
- **HeroUI Button onPress 在弹窗/Popover 内静默失效**（本项目实测两例：页宽 Popover、CoverPicker/IconPicker Modal）
  → 弹窗内交互一律用原生 `<button onClick>`，不要用 HeroUI Button 的 onPress
- **Tiptap 编辑器自身限高**：`.tiptap-wrap .tiptap` 全局 `max-height:70vh; overflow-y:auto`——
  改滚动结构（如全屏页页面级滚动）必须同步覆盖：`.tiptap-wrap.page-scroll .tiptap { max-height:none; height:auto; overflow-y:visible }`，
  否则外层怎么改 ProseMirror 都在内部滚
- **全屏页（PC）已是页面级滚动**：封面+标题+正文一起滚、滚动条贴视口右缘、顶栏 sticky；
  链路 FullscreenEditor(pageScroll) → BlinkoEditor → Editor → TiptapEditorContent(page-scroll class)

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
localStorage.setItem('blinkoToken', JSON.stringify({token:'<JWT>', user:{id:'1', name:'admin', role:'superadmin'}}))
```
- **必须带 `role:'superadmin'`**（本地 admin 在 DB 里就是 superadmin）：
  `UserStore.role` 直接读 `tokenData.value?.user?.role`，缺了就是 `''` → `isSuperAdmin` 为 false
  → **/settings 只渲染 4 个 tab**（基本信息/偏好/导出/关于），AI/用户列表/存储/插件等 9 个测不到。
  曾因此误判「本地非超管」，实际是注入数据不完整
- 前端存储 key：`localStorage.blinkoToken`（StorageState），值结构 `{token, user, requiresTwoFactor?}`
  要完整复刻 `UserStore.ready()` 里写入的 TokenData（id/name/nickname/image/role/expires/token）
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

## 控制台告警定位：用 CDP 抓完整调用栈（无组件栈时唯一可靠手段）
React/HeroUI 很多告警**没有组件树栈**，且 DOM 上库会补默认属性（扫不到）。
`msg.location()` 也只返回最外层 console 包装器位置（我们的 devConsole.ts），都没用。
正确做法：
```js
const cdp = await ctx.newCDPSession(page); await cdp.send('Runtime.enable');
cdp.on('Runtime.consoleAPICalled', e => { /* e.stackTrace.callFrames: functionName/url/line */ });
```
能穿透 console 包装层看到真实调用点（例：`useAutocomplete @ @heroui_react.js:19443`）。
配合「先清空收集器 → 再点击 → 再收集」的顺序（告警只在切换瞬间产生，点完再 clear 会全漏）。

### HeroUI 可访问性告警口径（实测）
- 会告警：Select / Slider / Textarea / Autocomplete —— **placeholder 不算**，`label={'x'}` 也不算（那是显示文本）
- 不告警：Input（有 placeholder 即可）、Switch（有 children 即可）
- `<Table>` 缺 aria-label 会告警，但 DOM 上库会补默认 aria-label → DOM 扫描扫不出来，只能靠静态扫 `<Table` 标签

## agent-browser 自动化技巧（本项目实测有效）
- React Aria Popover（HeroUI trigger）对 `.click()` 无响应 → eval 派发完整事件序列：
  pointerdown/pointerup/mousedown/mouseup/click（带 clientX/Y/pointerId/bubbles）
- 普通 onClick 的 div 用 `.click()` 即可；复杂图标按钮用 svg path d 前缀定位
- eval 变量跨调用残留（`Identifier already declared`）→ 全部 IIFE 包裹
- 编辑器 store 直读：Card 元素挂了 `__storeInstance`（`[...document.querySelectorAll('div')].find(d => d.__storeInstance)`）
- Tiptap 注意：失焦后 focus() 恢复上次选区——全选状态下经 Popover 插入会替换选区（惯例语义非 bug）
- **告警没有组件堆栈时**（如 react-aria 的 "must specify an aria-label"）：在 `addInitScript` 里劫持
  `console.warn/error`，命中关键词就存 `new Error().stack` → 能直接看到是 `useSlider` 还是别的 hook
- **不要只测首页**：用户报的都是具体页面。常用巡检路由
  `/ /ai /settings /resources /review /analytics /all /hub /plugin /?path=todo|notes|archived`
- 设置页 tab 受 `user.isSuperAdmin` 控制，本地非超管只能看到 basic/prefer/export/about 四个；
  AI/存储/快捷键/插件等**本地测不到**，需要静态扫描（找 `.map(` 缺 key、`<Slider>`/`<Select>` 缺 label）兜底
- HeroUI 里 `<Input>`/`<Textarea>` 没 label **不会**告警（placeholder 兜底），只有 **Slider / Select** 会

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

## AI 排障（2026-09-30 实战）
- **"AI_APICallError: Bad Request" 多半是嵌入/RAG 链路，不是聊天模型**：
  `ai.completions` 的 `withRAG` 默认 true（`aiStore.withRAG` 默认 true，对应输入框「知识库搜索」按钮），
  每次对话先 `queryVector()` → `embed()` 打 `{baseURL}/embeddings`。
  快速判定：同一请求加 `withRAG:false` 对比，若正常就是嵌入模型/端点问题
- **直连 provider 验端点**（比看代码快）：`POST {baseURL}/embeddings` 用已有模型 → 400 表示不支持；
  用不存在模型 → 404 `Model not exist`；`GET {baseURL}/models` 看有没有嵌入模型
- 本轮加了 `formatAiError()`（`server/aiServer/index.ts`）：把 `statusCode/url/responseBody` 拼进 message，
  以后再报 Bad Request 一眼能看出是哪个端点。新增 AI 错误处理都用它，别再 `throw new Error(error)`
- **RAG 失败要降级**：`AiService.completions` 里 RAG 查询已包 try/catch，失败只 warn 并继续聊天；
  未配 `embeddingModelId` 也跳过。不要把"增强功能"的失败变成"主功能不可用"
- 流式 tRPC 路由（generator mutation）用 curl/fetch 打必须带 **`trpc-accept: application/jsonl`**，
  否则 415 `use httpBatchStreamLink`
- `framer-motion` 的 `AnimatePresence` 用 `child.key || ''` 取 key →
  **多个无 key 子节点同时渲染会报 duplicate key `""`**。给每个子节点显式加 key

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
- **`icons.tsx` 是自动生成文件**：改 Icon 组件（如加 forwardRef）必须**同时改 `buildIcons.js` 里的模板字符串**
  （Icon 组件代码是内联在模板里的），否则下次 `bun run build:iconify:icons` 会冲掉改动
- **Icon 必须保持 `React.forwardRef<SVGSVGElement, IconProps>`**：HeroUI Tooltip/Badge/Popover 会给子元素挂 ref，
  不转发不但告警，tooltip 定位还会失准
- 全量核对脚本思路：解析 icons.tsx 的 `export const X: IconCollection` + `"prefix"` + 4 空格缩进的图标键
  → bundled 集合；再宽松扫源码所有 `'prefix:name'` 字面量 → 求差集（扫描器只认 `icon="..."` 会漏三元/数组写法）

## 资源模块文件夹模型（虚拟文件夹，2026-09-28 确认）
- `attachments.createFolder`（server/routerTrpc/attachment.ts）**只在 DB 插占位记录**：name='.folder'、type='folder'、path=`/api/file/{parent}/{name}/.folder`、perfixPath=`parent,name`（逗号分隔）
  → 不 mkdir、不在 OSS 建任何对象
- 列表里的文件夹是 SQL 从 `perfixPath` 用 `split_part` **虚拟推导**（DISTINCT ON folder_name），不是读文件系统
- 真实目录只在**上传时**产生：`uploadFileStream(stream,{folder})` 拼 `folderPrefix` → 本地 `fs.mkdir(dirname,{recursive:true})`；S3 模式只是 key 前缀（对象存储无目录概念），上传后 `createAttachment` 从 path 反推 perfixPath
- 前端 resources.tsx 过滤 `name !== '.folder'` 隐藏占位记录
- 不一致点：create 纯虚拟；**rename/delete 会真实操作存储**（`FileService.moveFile` / `deleteFile`）
- 坑：占位记录 path 写死 `/api/file/` 前缀，S3 模式下进入该文件夹上传的文件是 `/api/s3file/`，SQL 的 `CASE WHEN path LIKE '/api/s3file/%'` 可能取到占位行 → 前缀判断不准（仅影响文件夹项 path，暂无功能影响）

## 待办模块（基于现有 `/?path=todo` 视图，2026-09-28 落地）
- 现有 TODO 模型：`NoteType.TODO`(type=2)，完成=`isArchived=true`，截止日=`metadata.expireAt`(ISO)，
  优先级=`metadata.priorityUrgent × priorityImportant`（两布尔 → 四象限）
- **入口**：折叠「+ 加一条任务」→ 展开表单（`TodoQuickAdd.tsx`）
  - 优先级入口：旗子按钮（红/黄/蓝/灰 outline，对应 高/中/低/无）+ 点击弹出 4 选项面板（仿 Apple Reminders）
  - 旗子是内联 SVG，color 由 `PRIORITY_OPTIONS` 数组统一管理
  - outside-click 用 `mousedown` 监听器关闭（学 `PopoverFloat/index.tsx`）
- **视图**：`pages/index.tsx` 在 `path=todo` 时渲染
  - 顶部逾期 banner（纯前端算逾期数）
  - 项目 chips（按 `note.tags` 分组，含 done/total 进度）
  - 标签页：今天/逾期/即将到来/全部/完成，每个带计数徽标
- **卡片**：`BlinkoCard/TodoCard.tsx` 替换默认 BlinkoCard，含：左侧优先级色条 / 四象限 chip / 逾期天数 / 顺延次数 / 项目标签 / 悬浮操作图标（编辑/删除）
- **store**：`blinkoStore` 新增 `doneTodoList`（type=TODO & isArchived=true）

## 待办编辑器整合 Tiptap（2026-09-30 落地，全量整合）
- **待办的两处输入都换成 Tiptap**：`Common/TodoQuickAdd.tsx`（快速添加）、`BlinkoCard/TodoEditModal.tsx`（编辑弹窗）；
  `BlinkoCard/TodoCard.tsx` 正文改 `MarkdownRender` + `FilesAttachmentRender` 展示附件（原为 `whitespace-pre-wrap` 纯文本）
- **Editor 新增 3 个 props**（`Common/Editor/index.tsx`）：
  - `fixedNoteType` —— 强制 noteType，覆盖 `useEditorInit` 里基于 `searchParams.path` 的推断（待办传 `NoteType.TODO`）
  - `hideNoteTypeButton` —— 隐藏「闪念/笔记/待办」类型切换（避免误切）
  - `hideFullscreenButton` —— 隐藏右上角全屏（弹窗内不需要）
  - `fixedNoteType` 需一路透传给 `useEditorInit(store, onChange, onSend, mode, originReference, initalContent, fixedNoteType)`
- **提交/保存走 `onSend(args: OnSendContentType)`**：`args.content` / `args.files` / `args.references`；
  工具栏 SendButton 与 ⌘/Ctrl+Enter 都会进来，不要再手写一份 keydown
- **坑1：attachments 映射**。`args.files` 是 `FileType & { uploadPath }`，但**编辑态下已有附件经 `HandleFileType()` 只有 `preview`（=原 path），没有 `uploadPath`**
  → 必须 `path: i.uploadPath ?? i.preview`，否则保存会把已有附件路径写成 undefined（BlinkoEditor 也有这个隐患，未改）
  映射结果需 `as any` 才能过 `Attachment`（= prisma 全字段 & {size}）
- **坑2：新增 props 忘了解构**。在 `IProps` 里加了字段却在组件参数里漏写 → 运行时 `ReferenceError: xxx is not defined` → 整页白屏崩溃。改完必须实测
- `useEditorFiles` 里原本有 `console.log({ originFiles })` 调试日志，已删
- 验证要点：待办页工具栏 svg 数 9（闪念 11，差的是类型切换 + 全屏）；提交后编辑器自动清空、每次只建 1 条、可连续添加
- **正文任务清单可勾选**：`MarkdownRender` 的 `li` renderer 只有在**传了 `onChange` 且非 `isShareMode`** 时才走
  `ListItem`（可点击），否则渲染成只读列表 —— 待办卡片忘了传 `onChange` 就是"点不动"。
  写法照抄 `noteContent.tsx`：`onChange={updater => { const next = updater(raw); todo.content = next;
  blinko.upsertNote.call({ id, content: next, refresh: false }) }}`
  - updater（`ListItem.toggleTasksByIndex`）按「源 markdown 里第 N 个任务项」定位，
    所以要传**原始 content**；卡片显示用的 `stripContent()` 只删 `#标签#`、行结构不变，序号一致
  - 用 `useRef` 持有最新 content，避免连点时闭包陈旧覆盖前一次
  - `refresh: false` 避免重拉列表导致卡片跳动；upsert 不传 metadata 时后端**不会**清 metadata
- **翻译键**：`priority-high/medium/low/none` + `priority`（旧的 4 个 urgent-important/important/urgent/normal 已不用，但保留以防万一）
- **验证**：Playwright + 系统 Chrome `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - `page.addInitScript` 注入 token（必须在页面脚本前）
  - 验证 outside-click 要点空白处，不要点 sidebar/侧栏

## 编辑态自动保存（2026-10-01 落地，P0）
- **自动保存必须走 `blinko.autosaveNote({id, content})`，不要复用 `blinko.upsertNote`**
  原因：`PromiseState.call` 有 `loadingLock`，请求在飞时新调用被**静默丢弃** → 自动保存会丢最后一次编辑；
  且 upsertNote 会 toast / `refresh` / `if (content != null) eventBus.emit('editor:clear')`（清空编辑器！）
- `autosaveNote` 设计：promise 串行链 + `autosaveSeq` 序号，只发最新一版（跳过中间版本），
  保证乱序响应不会让旧内容复活；`cancelAutosave()` 递增 seq 作废排队任务（in-flight 的照常完成，无害）
- 调度在 `BlinkoEditor/index.tsx`：onChange → debounce 800ms → flush；
  `pendingAutosave` ref 快照 `{id, content}`，切换/卸载时 cleanup 补写（**必须快照 id**，否则会把旧内容写到新笔记上）
- **空内容不自动保存**（防误清空整篇）；手动发送前 `cancelAutosave()`，
  成功后 `lastSavedContent.current = 发送前的 content`（因为 upsertNote 成功后会 emit editor:clear 把编辑器清空）
- 后端护栏（`server/routerTrpc/note.ts`）：
  - `HISTORY_MERGE_WINDOW_MS = 60_000`：noteHistory 60s 内合并，不新增版本（实测 6 次保存 → 1 条历史）
  - `EMBEDDING_THROTTLE_MS = 60_000` + `scheduleEmbedding()`：节流且**尾部补偿**（窗口结束补跑一次，用最新内容）
- 状态指示：Editor 新增 `autosaveStatus?: 'idle'|'saving'|'saved'|'error'`；翻译键 `saving`/`saved`/`save-failed`
- 已知副作用：`notes.updatedAt` 是 `@updatedAt`，自动保存会刷新它（与手动保存一致）
- **UI 验证路径**：首页**双击卡片** → 编辑弹窗（BlinkoCard `handleDoubleClick` → `ShowEditBlinkoModel`）。
  卡片是 `[role=button]` 不是 `<button>`，evaluate 里要用 `querySelectorAll('button,[role=button]')`；
  右键菜单在首页不生效；`.tiptap` 用 `.last()` 取弹窗内的

## 编辑态「完成按钮」与操作即落库（2026-10-01 落地，P2）
- **按钮判定**：create 模式 = `SendButton`（纸飞机，唯一落库路径，**必须保留**）；
  edit 模式 = `DoneButton`（对勾，`title=t('done')`）。判断依据只是 `Editor` 有没有收到 `onDone`
- **自动保存只写 content**，附件 / @引用 / 类型切换原本全压在手动「发布」上。
  要把按钮换成「完成」，必须先把这三样改成操作即落库，否则会静默丢数据
- **后端硬约束（`server/routerTrpc/note.ts`）**：
  - `content == null` 时 **提前 return**，跳过附件/引用处理 → 即时落库**必须带 content**
  - 附件 = **追加语义**（difference 后只新增，不删）；引用 = **全量替换**（传 [] 会清空引用）
- **两条链，不能合并**：
  - `autosaveNote` —— seq 合并，只发最新一版（击键级，中间版本丢弃无害）
  - `silentUpsertNote` —— **不合并**，离散操作（上传/引用/类型），合并会丢写入
- **用 `reaction` 而不是 useEffect deps** 监听 `store.references` / `store.noteType` / `store.files`：
  这些值在父组件 render 时还没被 `useEditorInit` 填充，用 deps 会在首次填充时误触发一次
  `references: []` 的全量替换（**会清空引用**）。reaction 在 `useEditorInit` 之后注册，基线是真实值
- 打开笔记时三个 reaction 各触发一次 → 300ms 合并窗口合成一次幂等空写
- **`editContentStorage` 本地草稿会在打开编辑态时覆盖服务端内容**。自动保存成功后必须
  `removeByFind` 清掉，只在"崩溃/未保存"时保留；另外手动保存清理曾用
  `editAttachmentsStorage` 的 index 去删 `editContentStorage`（两个 list 不同源，错位）→ 改各自 removeByFind
- **测试注意**：编辑弹窗里有 **2 个 file input**，第一个是首页底部新建编辑器的（create 模式，
  上传只进 `createAttachmentsStorage`）→ 测附件落库必须 `nth(1)`；
  清理测试笔记要用 `LIKE '%P2-%'`（内容以 `# ` 开头，前缀匹配不到）

## 页宽设置（2026-10-01 落地，P3）
- 三档：default=1000px、wide=1400px、full=undefined（铺满容器）
- 作用于 **全屏编辑器**（`FullscreenEditor`）和 **详情页**（`/detail?id=`）
- 纯前端偏好，localStorage key：`blinko-note-page-width`
- **新 store 不要 `extends Store` + `makeAutoObservable`**：MobX 禁止对超类用 `makeAutoObservable`，
  会抛 `'makeAutoObservable' can only be used for classes that don't have a superclass`，
  导致整站白屏。应改用 `makeObservable(this, { ... })` 显式注解
- 自定义 SVG 图标比文字按钮更直观：外框表示窗口，内块表示正文，内块宽度随档位变化

## 编辑态「完成按钮」与操作即落库（2026-10-01 落地，P2）
- **按钮判定**：create 模式 = `SendButton`（纸飞机，唯一落库路径，**必须保留**）；
  edit 模式 = `DoneButton`（对勾，`title=t('done')`）。判断依据只是 `Editor` 有没有收到 `onDone`
- **自动保存只写 content**，附件 / @引用 / 类型切换原本全压在手动「发布」上。
  要把按钮换成「完成」，必须先把这三样改成操作即落库，否则会静默丢数据
- **后端硬约束（`server/routerTrpc/note.ts`）**：
  - `content == null` 时 **提前 return**，跳过附件/引用处理 → 即时落库**必须带 content**
  - 附件 = **追加语义**（difference 后只新增，不删）；引用 = **全量替换**（传 [] 会清空引用）
- **两条链，不能合并**：
  - `autosaveNote` —— seq 合并，只发最新一版（击键级，中间版本丢弃无害）
  - `silentUpsertNote` —— **不合并**，离散操作（上传/引用/类型），合并会丢写入
- **用 `reaction` 而不是 useEffect deps** 监听 `store.references` / `store.noteType` / `store.files`：
  这些值在父组件 render 时还没被 `useEditorInit` 填充，用 deps 会在首次填充时误触发一次
  `references: []` 的全量替换（**会清空引用**）。reaction 在 `useEditorInit` 之后注册，基线是真实值
- 打开笔记时三个 reaction 各触发一次 → 300ms 合并窗口合成一次幂等空写
- **`editContentStorage` 本地草稿会在打开编辑态时覆盖服务端内容**。自动保存成功后必须
  `removeByFind` 清掉，只在"崩溃/未保存"时保留；另外手动保存清理曾用
  `editAttachmentsStorage` 的 index 去删 `editContentStorage`（两个 list 不同源，错位）→ 改各自 removeByFind
- **测试注意**：编辑弹窗里有 **2 个 file input**，第一个是首页底部新建编辑器的（create 模式，
  上传只进 `createAttachmentsStorage`）→ 测附件落库必须 `nth(1)`；
  清理测试笔记要用 `LIKE '%P2-%'`（内容以 `# ` 开头，前缀匹配不到）
