# Blinko 项目长期笔记

## 本地研发环境
- 单端口 Express + ViteExpress，端口 **1111**；唯一启动命令 `cd /Users/baihe/blinko/app && ~/.bun/bin/bun run dev`（bun 在 `~/.bun/bin/bun`）。改动无需重启（Vite HMR + bun --watch）。探活 `curl http://127.0.0.1:1111/health`
- **启动必须用 Bash 工具 `run_in_background:true` 跑前台 `bun run dev`**（exec 直接当托管任务子进程）。千万别在命令里 `nohup bun run dev &` 后台起——命令结束时工具向进程组发 SIGHUP，bun 会 `terminated by signal SIGHUP` 被杀，服务悄悄 502（曾导致用户"重启后还是不行"误判）。`docker` CLI 不在非交互 zsh 的 PATH，用 `bash -lc 'docker ...'` 或 `/usr/local/bin/docker`
- 数据库：`postgresql://baihe@localhost:5432/blinko`，跑在 **OrbStack 容器 `blinko-dev-pg`**（ OrbStack 退出会连不上 → `open -a OrbStack && docker start blinko-dev-pg`）。psql 用 `/opt/homebrew/Cellar/libpq/18.4/bin/psql`（无服务端，只有客户端）
- 主色变量是 **`--primary`**（globals.css 默认黑/暗白；DB `config.themeColor` 运行时 setProperty 覆盖，见 user.ts ~L280）。**不存在 `--heo-main`**——用了 `bg-[var(--heo-main)]` 会透明底+白字=按钮隐形（发布弹窗踩过）。自定义主色原生按钮统一用 `bg-primary text-primary-foreground`
- 类型检查：`app/` 下 `NODE_OPTIONS="--max-old-space-size=8192" bunx tsc --noEmit`（~2.5m，无内存参数会 OOM）。基线约 55 个既有错误 → **只看日志里有没有自己改的文件名**。注意给 notesSchema 加必填字段会牵连 `randomNoteList` 等手工构造返回对象的接口

## 关键约定与坑
- **dayjs** 统一从 `@/lib/dayjs` 导入；新格式符先确认插件已注册，否则整树白屏
- **config**：`ZUserPerferConfigKey`=用户级（按 userId 过滤）、`ZConfigKey`=全局；新增配置要同时补 `ZConfigSchema` + key 白名单
- **前端不要直接引用外部站点资源**（favicon/图片）：服务端可达 ≠ 浏览器可达（服务端可能走代理），浏览器请求失败会打 ERR_TIMED_OUT 且 JS 无法抑制。做法：后端下载转 data URI 返回（linkPreview 已如此），或走同源代理
- **CSS 变量引用前先确认已定义**：`var(--x)` 未定义会让整条声明在 computed-value 时失效（不是报错、不告警），典型后果是"元素在 DOM 里但看不见"。写新样式别凭记忆造变量名；排查用 CDP `CSS.getMatchedStylesForNode` 看命中链。改 markdown 间距类全局样式前注意 `.markdown-body pre{margin-bottom:0}` 和 `> :last-child{...!important}` 会盖住
- **编辑器换行丢失根因（已定位，2026-10-03）**：`useEditor.ts` 的 `Markdown.configure({breaks:false})` 是元凶。**实测（真实 tiptap + jsdom 往返）**：`breaks:false` 时，markdown 的**单个裸换行** `A\nB`（源码/MD 视图回车、粘贴、AI 生成内容常见形态）在 `getMarkdown()` 序列化时被**压成空格**（直接输出 `"A B"`），再打开即"换行没了"；而段落（双换行 `A\n\nB`）和反斜杠续行硬换行（`A\\\nB`，Shift+Enter 产生）都不受影响——所以只盯"回车=段落"会误判。**修复 = `breaks:true`**：单换行稳定保真为硬换行，且对段落/反斜杠形态向后兼容（实测序列化结果不变）。之前在 MarkdownRender 加的 `remarkBreaks`/`stripTrailingBackslashes` 只是**阅读态**补丁，没碰编辑器保存序列化，故单独无效。
- **MarkdownRender 渲染兜底**（Common/MarkdownRender/index.tsx）：编辑侧 MarkdownHardBreak 输出**裸 `\n`**（替代默认 `\\\n`，从源头消灭反斜杠污染）。`stripTrailingBackslashes()` 缩窄为 `(^|[^\\])\\$`（孤立单 `\`）+ `inMath` 状态机（`$$...$$` 起止识别，保护 KaTeX matrix/aligned）+ `inFence`（``` 代码块跳过）。`remarkBreaks` 单换行→br。缩进的 callout 会被当代码块原样显示 HTML 符号 → `liftIndentedCallouts()` 抬升缩进。**列表卡片(NoteContent)与详情共用 MarkdownRender**，改这里两处同效
- **MarkdownHardBreak 扩展**（Common/Editor/Tiptap/markdownHardBreak.ts）：覆盖 hardBreak `addStorage().markdown.serialize`，非表格输出裸 `\n`、表格内 `<br>`。配套 useEditor.ts `StarterKit.configure({ hardBreak: false })` 禁用默认避免 duplicate name 警告。**新保存的内容里永远没有反斜杠**，所有不走 MarkdownRender 的消费方（引用摘要/选择器/导出/AI 上下文）天然干净
- **z-index 铁律**：全屏编辑层 `fixed inset-0 z-[9999]`，任何 portal 弹窗 wrapper 必须 >9999（CoverPicker/IconPicker=z-[10000]）。排查"点击无反应"先 `elementFromPoint(视口中心)` 看被谁盖住
- **HeroUI Button onPress 在弹窗/Popover 内静默失效**（页宽 Popover、CoverPicker/IconPicker Modal 均实测）→ 弹窗内一律原生 `<button onClick>`
- **Tiptap 限高**：`.tiptap-wrap .tiptap` 全局 `max-height:70vh` 内部滚动；改滚动层级必须同步 `.tiptap-wrap.page-scroll .tiptap { max-height:none }`。全屏页（PC）已是页面级滚动（FullscreenEditor→BlinkoEditor→Editor→TiptapEditorContent，pageScroll prop 链）
- **MobX**：`extends Store` 的类不能用 `makeAutoObservable`（会整站白屏），用 `makeObservable` 显式注解；`PromiseState.call` 有 loadingLock 并发被静默丢 → 自动保存走独立串行 `autosaveNote`，离散操作走 `silentUpsertNote`（不合并）
- 监听 `references/noteType/files` 用 `reaction` 而非 useEffect（避免首次填充把引用清空）
- **依赖卫生**：remark-breaks、@tiptap/extension-hard-break 必须显式写进 app/package.json（不要靠 @lobehub 间接 hoist，CI / 重装机器可能解析不到）
- **HighlightTags 死代码**：原 MarkdownRender/index.tsx:73 `text.replace` 在 children 为 React 元素数组时直接抛 TypeError 进 catch，逻辑从未跑过；新版本用 `reactNodeToString` 递归拍平 + 末行不再追加 `<br>` 修好

## 封面 + 图标（全走 notes.metadata，不改库）
- `metadata.cover`：`cover:cover-N`（图库键）或上传路径；图库 `NoteCover/defaultCovers.ts` 为程序生成 SVG（5 分类 43 张：official8/work8/scenery11/creative8/tech8，key cover-1..44，1-12 兼容旧数据），比例 **2.35:1**（2000×400）
- 本地存储封面 `<img>` 要用 `toAuthenticatedCoverUrl()` 拼 token query，否则裂图
- 取景 offset = `object-position: x% y%`；内联拖拽实时写 store
- 弹窗内按钮全原生 button；连点 metadata 操作会撞 loadingLock（单次正常）

## 笔记标识与发布（2026-10-02）
- 标识只有两层：`notes.id` Int 自增（内部主键/外键/`/detail?id=`）；`shareEncryptedUrl` 8 位串（首次开分享生成，`/share/<串>`）。无 uuid/slug/内容哈希
- **发布到主页**：`notes.isPublished/publishId/publishedAt`（migration 20261002150000）。`publishId`=8 位 `[a-z0-9]`（`generateShortId()`，helper.ts，crypto.randomInt），首次发布生成、取消保留、重发沿用
- 接口（note.ts）：`publishNote`（auth）+ `publicPublishedList`/`publicPublishedDetail`（public + openapi meta → REST `/api/v1/note/published-list|published-detail`，POST JSON）。列表有 5s cache.wrap
- 前端：右键菜单/下拉「发布到主页」→ `BlinkoPublishDialog`（原生 button）；翻译键 `publish-*` 三语已补

## 编辑器 P0-P2 要点（自动保存/单树/完成按钮）
- 自动保存 `blinko.autosaveNote({id,content})`：串行+seq 只发最新；debounce 800ms 在 BlinkoEditor；空内容不保存；成功后清 `editContentStorage` 草稿（removeByFind，勿用 index 错删）
- 后端护栏：noteHistory 60s 合并窗口；embedding 60s 节流+尾部补偿
- 阅读/编辑同一棵 Tiptap 树只切 `setEditable`；编辑态按钮=DoneButton（onDone），create=SendButton 必须保留
- 后端 upsert 硬约束：`content==null` 提前 return；附件=追加语义、引用=全量替换（传 [] 清空）
- ⌘/Ctrl+Enter 编辑态走 handleDone；测试注意弹窗里有 2 个 file input（附件用 nth(1)）

## 无密码登录态注入（前端验证必备）
```bash
TOKEN=$(psql ... -t -A -c 'SELECT "apiToken" FROM accounts WHERE id=1;')
localStorage.setItem('blinkoToken', JSON.stringify({token:TOKEN, user:{id:'1',name:'admin',role:'superadmin'}}))
```
必须带 `role:'superadmin'`，否则 /settings 只渲染 4 个 tab。apiToken 也可作 `Authorization: Bearer` 直调 tRPC

## 前端排查 / 自动化
- 白屏顺序：curl `/src/...`（**不是** `/app/src/...`，会被 SPA fallback 成 HTML）看 200 → `/signin` 能否渲染 → `vite-error-overlay` → 注 token 看 rootLen
- Vite import 别名写错会白屏且 overlay 显示 Failed to resolve import（如 Toast 是 `@/store/module/Toast/Toast`）
- React Aria Popover 对 .click() 无响应 → 派发完整 pointer/mouse 事件序列；eval 变量残留 → IIFE；右键菜单项无 role=menuitem，用文本+坐标定位点击
- CDP 抓 console 调用栈（无组件栈时唯一手段）：`ctx.newCDPSession` + `Runtime.consoleAPICalled`
- HeroUI 告警口径：Select/Slider/Textarea/Autocomplete 会告警（placeholder 不算）；Input/Switch 不会；`<Table>` 缺 aria-label 只能静态扫
- Playwright 用系统 Chrome：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；ESM 不吃 NODE_PATH → `createRequire('/Users/baihe/.workbuddy/binaries/node/workspace/node_modules/')` 引 playwright-core

## Tiptap 编辑器
- 代码 `Common/Editor/Tiptap/`；Callout 自研 Node（HTML 块保真存储，type+icon 两 attr，CSS `content:attr(data-callout-icon)` 编辑端 tiptap.css + 查看端 github-markdown.css 两处）
- 表格（飞书手感）：tableExtension resizable+preserveHtml（有合并/列宽时整表转 HTML `<table>`）；moveRow/MoveColumn=delete+insert+mapping.map；TextSelection 从 `@tiptap/pm/state` 导入
- MarkdownRender 任务清单 checked 必须递归找 input；漏传 onChange = 待办点不动

## AI
- "AI_APICallError: Bad Request" 多半是嵌入/RAG：`withRAG` 默认 true → 先打 `{baseURL}/embeddings`；同请求 `withRAG:false` 对比判定。RAG 失败已降级不阻断聊天
- AI 错误统一走 `formatAiError()`（拼 statusCode/url/responseBody）
- 本地 aiProviders/aiModels 表为空 → AI 功能全不可用，需先在设置里配 provider+模型+mainModelId
- 流式 tRPC 路由 curl 必须带 `trpc-accept: application/jsonl`

## 容器 / 镜像
- start.sh：**脚本里任何 cd 都会污染后续相对路径**（曾致 crash-loop 502）；预压缩用 node zlib 别 shell gzip（busybox 可能没有，会留空 .gz）
- 502 定位链：静态资源也 502 → upstream 挂；看 docker compose logs 末尾 MODULE_NOT_FOUND/EADDRINUSE；ghcr 匿名不可列 tag 无法切旧版回滚
- 镜像已瘦身（commit 8f3fdfe5）：apk add/del 必须同 RUN（跨层删除不减体积）、去全局 prisma（start.sh 用 `/app/node_modules/.bin/prisma`）、prisma 引擎按架构裁剪、删 gnu 版 sharp/lightningcss、删 *.map。压缩 412→228MB。ghcr 查压缩层大小：匿名 token→manifest list→amd64 digest→layers 求和
- Dockerfile 与 dockerfile 两份文件，CI（build-prod-image.yml，push main_baispace 触发）用 **dockerfile**（小写），改完要同步
- 本地 docker build 走不通（auth.docker.io 被网络拦）；验证镜像：`docker run` + `--env-file .env`（JWT_SECRET 要一致否则页面 401）

## 图标体系
- 本地：`Common/Iconify/icons.tsx` 由 buildIcons.js 扫描生成（46 集合打包），**icons.tsx 是生成文件，改 Icon 组件必须同时改 buildIcons.js 模板**；Icon 必须 forwardRef（HeroUI Tooltip 挂 ref）
- 线上 app.blinko.space 用 Iconly（映射三层+降级），产物在 `.workbuddy/outputs/blinko-icons/`

## 资源文件夹（虚拟模型）
- createFolder 只插 DB 占位（name='.folder', perfixPath 逗号分隔），列表 SQL 按 perfixPath 虚拟推导；rename/delete 才真实操作存储；S3 模式 `/api/s3file/` 前缀判断有隐患（暂无功能影响）

## 编辑器空行支持（2026-10-04）
- **空段落往返**：markdown 纯空白行无法表达空段落（连续空行解析时折叠）。`Tiptap/markdownBlankLine.ts`：空段落序列化 = 一行 `\u00a0`（CommonMark 不算 blank line，稳定往返）；appendTransaction 把 nbsp 段落归一化回真空段落（光标输入无残留）；`normalizeBlankLines()` fence 感知，装载前把历史 `\n{3,}` 转 nbsp 行
- **StarterKit 现配置**：`hardBreak:false` + `paragraph:false`（都由自定义扩展接管 markdown 序列化）；`breaks:true`（单换行=硬换行）
- **坑**：空行判定用 `/^[ \t]*$/` 不用 `trim()`——JS trim 把 `\u00a0` 算空白，规范化不幂等
- **坑**：tiptap-markdown 覆盖默认节点序列化必须「关 StarterKit 默认 + 注册同名 extend 扩展」，`getMarkdownSpec` 优先读扩展自身 `storage.markdown`
