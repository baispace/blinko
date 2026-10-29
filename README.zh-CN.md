<p align="center">
  <img src="./app/public/home.png" alt="Ink" />
</p>

<h1 align="center">Ink · 墨记</h1>

<p align="center">
  <strong>闪念 · 笔记 · 待办 · AI 工作流</strong><br/>
  一个面向个人创作者的自托管笔记 / 闪念 / 待办 / AI 工作流平台。<br/>
  数据完全属于你，跑在你自己的机器上。
</p>

<p align="center">
  <a href="https://ink.baispace.cn">在线 Demo</a> ·
  <a href="./docs/使用手册.md">使用与接入手册</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-架构与项目结构">架构</a> ·
  <a href="#-ai--mcp">AI / MCP</a> ·
  <a href="./README.md">English</a>
</p>

---

## ✨ 主要功能

### 📝 三种记录

| 类型 | 适用 | 特点 |
|---|---|---|
| **闪念** | 灵感、临时想法 | 弹窗式极简输入，全键盘流；支持 `#` 标签 / `@` 引用笔记 |
| **笔记** | 长文、教程、思考 | Markdown 富文本（Tiptap），附件、引用、双向链接、版本历史 |
| **待办** | 任务、计划 | 日期 + 优先级，键盘全链路勾选 / 排序 / 过滤 |

### 🗂️ 组织与回顾

- **多级标签**：支持父子级嵌套（`#work/projects/ink`），按层级自动归类
- **双向引用**：`@` 引用其它笔记，被引笔记自动汇总「被谁引用」
- **附件管理**：图片、文件，按笔记归集，可单独浏览全部附件
- **分享**：公开链接（密码保护 / 过期 / 限次）+ 内部分享
- **随机复习**：基于时间窗口的「今天回顾几条」
- **归档 / 回收站**：软删除 + 一键清空
- **发布**：单笔记可生成独立公开页（`/share/...`）

### 🤖 AI 能力

- **多 provider**：OpenAI / Anthropic / Google / Azure / Ollama / OpenAI 兼容接口 自由切换
- **AI 聊天**：流式输出、可中止、带引用回链到笔记
- **RAG 检索增强**：基于 embedding 的语义搜索
- **AI 工作流**：
  - **daily 日报**：自动汇总今日记录 + 待办，生成日报笔记
  - **weekly / practice**：周回顾 / 练习题（可扩展）
- **定时任务**（pg-boss 后台）：cron 调度 + 任务历史
- **外部 AI 对话导入**：通过 `importConversation` 幂等 API 把 ChatGPT / Claude 等其他 AI 工具的完整对话记录（角色、模型、时间戳、metadata）沉淀到 Ink

### 🧩 个性化

- **站点品牌**：自定义站名、tagline、Logo（设置页可改，存 DB 实时生效）
- **主题**：亮 / 暗 / 跟随系统 + 8 色主题色（CSS 变量驱动）
- **工作空间下拉菜单**：3 个内置 system 项 + 可配置内部 / 外部链接（Quick Links，最多 12 条）
- **多语言**：内置中英双语，i18n 框架支持扩展

### 🔌 MCP（Model Context Protocol）

把 Ink 的笔记能力暴露为 **11 个 MCP 工具**，任何兼容 MCP 的 AI 客户端（Claude Desktop、Cursor、Cline 等）都能直接读写你的笔记库：

- `searchBlinko` 全文 / 标签 / 时间检索
- `upsertBlinko` 创建或更新笔记
- `updateBlinko` 部分更新
- `deleteBlinko` 删除（带确认）
- `createComment` 给笔记加评论
- `webSearch` 联网搜索
- `createScheduledTask` / `listScheduledTasks` / `deleteScheduledTask` 定时任务
- `importConversation` 外部 AI 对话幂等导入
- `webExtra` 网页抓取

支持 stdio 和 HTTP（SSE / Streamable HTTP）双传输，授权走 Personal Access Token。

### 🖥️ 多端

- **Web**（Vite + React 18 + HeroUI）
- **Tauri 桌面**（macOS / Windows / Linux）
- **Tauri 移动**（Android，iOS 实验性）
- **quicknote / quickai / quicktool** 桌面小窗：全局快捷键弹起

### 🔒 数据所有权

- 全部笔记 / 附件 / 配置存你自己的 PostgreSQL
- 本地文件系统存附件（或 S3 兼容对象存储）
- 没有任何遥测或外部依赖
- 完整导出 / 导入 API

---

## 🚀 快速开始

### 方式一：Docker Compose（推荐生产部署）

```bash
# 克隆
git clone https://github.com/baispace/blinko.git ink
cd ink

# 复制环境变量模板并修改
cp .env.docker.example .env
# 编辑 .env，NEXTAUTH_SECRET 必须改成强随机值：
#   openssl rand -base64 32

# 一键启动
docker compose -f docker-compose.prod.yml up -d

# 访问
open http://localhost:1111
```

`docker-compose.prod.yml` 启动两个容器：

- `ink-web`（Ink 应用，端口 1111）
- `ink-postgres`（PostgreSQL 14，端口 5432，仅 docker 网络内可达）

应用首次启动会自动跑 Prisma migration + 注入 seed 数据（demo 标签 + 欢迎笔记）。

### 方式二：本地开发模式

```bash
# 前置：Node.js ≥ 20、Bun ≥ 1.2.8、PostgreSQL ≥ 14

# 1. 克隆
git clone https://github.com/baispace/blinko.git ink
cd ink

# 2. 安装依赖（monorepo workspaces）
bun install

# 3. 准备数据库（创建 blinko 库 + 设置 DATABASE_URL）
# 4. 复制环境变量
cp .env.local.example .env
# 编辑 .env，DATABASE_URL 指向本机 PostgreSQL

# 5. 跑 Prisma migration
bun run prisma:migrate:dev

# 6. 启动 dev server（同时跑 Express + Vite，端口 1111）
bun run dev:backend    # 仅后端
# 或
cd app && bun run dev  # 仅前端（Vite）
```

---

## 🏗️ 架构与项目结构

```
ink/                          ←  monorepo（Bun workspaces + Turbo）
├── app/                      ←  React 18 + Vite + HeroUI 前端
│   ├── src/
│   │   ├── pages/            ←  路由：home / detail / ai / settings / share / ...
│   │   ├── components/       ←  UI 组件（Sidebar / Editor / Card / ...）
│   │   ├── store/            ←  MobX stores（blinko / ai / user / config）
│   │   └── lib/i18n.ts
│   ├── src-tauri/            ←  Tauri 桌面端
│   └── tauri-plugin-blinko/  ←  定制 Tauri 插件
├── server/                   ←  Node + Express + tRPC 后端
│   ├── routerTrpc/           ←  类型安全 tRPC 路由（笔记/AI/设置/用户/...）
│   ├── routerExpress/        ←  Express 路由（文件上传 / MCP / OAuth callback）
│   ├── aiServer/             ←  AI providers + MCP tools + 工作流引擎
│   └── jobs/                 ←  pg-boss 定时任务（auto-archive / embedding 重建 / AI 任务）
├── shared/                   ←  跨包共享 TS lib（types / zod schema / utility）
├── blinko-types/             ←  Prisma 生成的类型
├── prisma/                   ←  schema.prisma + 迁移 + seedfiles
├── dockerfile                ←  镜像构建（多阶段，bun 1.2.8 + arm64 sharp 预装）
├── docker-compose.prod.yml   ←  生产编排（web + postgres）
└── .env.*.example            ←  环境变量模板
```

**技术栈**：

- 前端：React 18 + TypeScript + Vite + HeroUI + MobX + Tiptap + i18next
- 后端：Node + Express + tRPC + Prisma + pg-boss
- 数据库：PostgreSQL 14+
- 桌面：Tauri 2.x
- 包管理：Bun ≥ 1.2.8
- Monorepo：Turbo

---

## ⚙️ 配置

### 关键环境变量

完整模板见 `.env.local.example`（开发）和 `.env.docker.example`（Docker）。

| 变量 | 说明 | 必须 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 | ✅ |
| `NEXTAUTH_URL` | 应用对外地址（含协议） | ✅ |
| `NEXT_PUBLIC_BASE_URL` | 同上，浏览器可见 | ✅ |
| `NEXTAUTH_SECRET` | JWT 签发密钥，**生产必须用强随机**：`openssl rand -base64 32` | ✅ |
| `NODE_ENV` | `development` / `production` | 建议 |

应用内所有「品牌 / 主题 / 工作空间菜单 / Quick Links」都在设置页可视化配置，存 DB，不需要改环境变量。

### 备份

PostgreSQL 数据 + `.blinko/files/`（本地附件目录）就是全量数据。建议：

```bash
# 数据库
docker exec ink-postgres pg_dump -U postgres postgres > backup.sql

# 附件（如果挂载到本地）
tar -czf attachments.tar.gz /path/to/.blinko/files/
```

---

## 🤖 AI & MCP

### 添加 AI Provider

设置 → AI 服务商 → 添加：

- **Provider 类型**：OpenAI / Anthropic / Google / Azure / Ollama / OpenAI 兼容
- **API Key** + **Base URL**（兼容接口可填自建网关）
- **Model**：手动添加或一键拉取 provider 全部可用模型
- **Capabilities**：勾选「对话 / Embedding / 工具调用」

### 启用 MCP 服务

设置 → AI → MCP Servers：

- **stdio transport**：本地命令（如 `claude-desktop`）+ env / args
- **HTTP transport**：远程 MCP server URL + headers（含 PAT）

Ink 自己的 MCP server 默认开启，端点：

- HTTP Streamable：`POST /api/mcp`（OAuth / PAT 鉴权）
- HTTP SSE：`GET  /api/mcp/sse`（旧客户端兼容）

### 外部 AI 对话导入

```bash
curl -X POST http://localhost:1111/api/v1/ai/import \
  -H "Authorization: Bearer $INK_PAT" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "chatgpt",
    "externalId": "conv_abc123",
    "title": "Ink 二次开源设计讨论",
    "model": "gpt-4o",
    "createdAt": "2026-10-15T10:00:00Z",
    "messages": [
      { "externalId": "msg_1", "role": "user", "content": "..." },
      { "externalId": "msg_2", "role": "assistant", "content": "...", "model": "gpt-4o" }
    ]
  }'
```

幂等键：`(accountId, externalId)` 唯一约束，重复推送只更新不重复创建。

---

## 🧩 个性化

### 站点品牌

设置 → 站点外观 → 站名 / tagline / Logo：

- `customTitle`：默认 `Ink`
- `customTagline`：默认 `闪念 · 笔记 · 待办 · AI 工作流`
- `customIcon`：上传 logo PNG/SVG，落地 `/api/file/...` 即时生效

### 主题

- **模式**：亮 / 暗 / 跟随系统（设置 → 外观与语言）
- **主题色**：8 色预设（蓝 / 红 / 紫 / 绿 / 橙 / 粉 / 森 / 青绿），CSS 变量 `--primary` 驱动所有交互色

### 工作空间下拉菜单

左下角点击站名 → 下拉菜单显示：

- 3 个内置 system 项（返回主页 / 站点外观 / 关于本站）
- 你自定义的内部链接（指向 Ink 内部路由）
- 你自定义的外部链接（指向博客 / 文档 / 第三方）

最多 12 条 Quick Links，编辑后立刻同步到所有客户端。

---

## 🛠️ 开发

### 常用命令

```bash
bun install                  # 装依赖（monorepo workspaces）
bun run prisma:generate      # 生成 Prisma client
bun run prisma:migrate:dev   # 跑 migration（dev 模式）
bun run dev                  # Tauri 桌面 dev
bun run dev:backend          # 仅后端（Express + Vite combined）
bun run dev:frontend         # 仅前端（Vite）
bun run build:web            # Web 构建
bun run prisma:studio        # Prisma Studio 数据库管理
bun run test                 # 跑测试
```

### 调试技巧

- `app/src/store/` 下的 MobX stores 用 React DevTools + mobx-devtools 观察
- tRPC 请求用 `trpc-client-devtools` 浏览器扩展
- 数据库：Prisma Studio (`bun run prisma:studio`)
- 临时脚本：直接 `bun -e '...'` 跑

---

## 🤝 贡献

欢迎 PR。约定：

1. **改动文件**：保持 commit 原子（一个 commit 一件事）
2. **Commit message**：英文 `type(scope): subject`（feat / fix / refactor / chore / docs），subject 不超过 72 字符
3. **TypeScript**：CI 跑 `tsc --noEmit` 需通过；新增文件避免 `any`
4. **测试**：核心业务逻辑新增必须带测试（参考 `scripts/tests/`）
5. **不引入秘密**：token / 密码 / 用户数据禁止进 git
6. **PR 前**：本地跑一遍 dev server 确认无回归

提 issue 请附：

- Ink 版本（`git rev-parse HEAD`）
- 操作系统 / Node / Bun / Postgres 版本
- 复现步骤 / 报错截图 / 关键日志

---

## 🪪 License

[MIT](./LICENSE) — 自由使用、修改、商用。保留版权即可。

---

## 🙏 致谢

- 基于 [Blinko](https://github.com/blinko-space/blinko) 二次开源
- UI 框架 [HeroUI](https://heroui.com/)
- 编辑器 [Tiptap](https://tiptap.dev/)
- AI SDK [Mastra](https://mastra.ai/) / [Vercel AI SDK](https://sdk.vercel.ai/)
- 后台任务 [pg-boss](https://github.com/timgit/pg-boss)
- 状态管理 [MobX](https://mobx.js.org/)
- 桌面壳 [Tauri](https://tauri.app/)

<p align="center">
  Made with 🖋 by <a href="https://baispace.cn">baispace</a>
</p>
