# Blinko 项目长期笔记

## 本地研发环境
- 单端口架构：Express + ViteExpress，端口 **1111**；后端 `bun run dev:backend`（bun --watch 自动重启）
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

## 图标体系（本地与线上站点是两套，勿混用）
- **本地仓库代码（旧版）**：`app/src/components/Common/Iconify/icons.tsx`，由 `buildIcons.js` 扫描生成，
  打包 46 个 Iconify 集合（hugeicons / solar / tabler / lucide / mingcute …），缺失时 fallback 到 `@iconify/react` 在线渲染。
  用法 `<Icon icon="lucide:maximize" />`。改图标后需跑 `bun run build:iconify:icons` 重新生成。
- **线上站点 app.blinko.space（新版）**：已换为 **Iconly**（Light-Outline）统一图标库，
  任意 Iconify 名 → 归一化为 Iconly 图标（三层映射：导航 7 / 语义 96 / 品牌 25 + 关键词降级函数）。
  静态 `assets/iconly/flat/*.svg`（132 个，懒加载）+ Lottie 动画 `assets/iconly/{actions,ai,waiting}/*.json`（83 个），依赖 `lottie-web`。
  站点已提取产物（含 83 个标准 Lottie JSON + 22 个内联 SVG + 总览页）→ `.workbuddy/outputs/blinko-icons/`
