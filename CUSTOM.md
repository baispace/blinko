# 我的 Blinko 定制分支说明

本仓库是 [blinkospace/blinko](https://github.com/blinkospace/blinko) 的 fork，用于承载个人定制改动。

---

## 分支模型

```
blinkospace/blinko  (upstream，别人的)
        │  ① Sync Upstream workflow（每周一自动，也可手动触发）
        ▼
      main          上游的纯净镜像 —— 只快进，永不提交任何自己的东西
        │  ② workflow 内自动 git merge
        ▼
      custom        所有定制改动 —— 实际部署的是这个分支
        │  ③ Build Custom Image workflow
        ▼
   ghcr.io/baispace/blinko:custom
        │  ④ 服务器 docker compose pull
        ▼
      服务器（只拉镜像，不构建）
```

**本地只做两件事**：写代码（提交到 `custom`）和 pull 新镜像跑。同步上游、构建镜像全部在 GitHub Actions 里完成——因为 GitHub 之间互联快且稳，而本地到 GitHub 的大流量传输（完整历史几 GB 的协商）在国内网络下极易卡死（实测 HTTPS 直接 HTTP2 framing 报错，SSH 大传输也超时）。

**为什么这么分**：`main` 永远等于上游，所以「同步上游」永远是一句无冲突的快进；`custom` 只知道自己的改动，上游更新时冲突范围只限于你真正改过的文件。

---

## 三条铁律（决定合并是否痛苦）

| # | 规则 | 原因 |
|---|------|------|
| 1 | **能配置的绝不改代码** | 主题色、封面字段、标签白名单优先走环境变量/数据库配置，零冲突面 |
| 2 | **优先新增文件，少改已有文件** | 新增文件永不冲突；改动集中在少数文件里 |
| 3 | **必须改已有文件时，只做「小挂点」** | 例如在 `App.tsx` 加一行路由，而不是重写组件内部 |

### 具体做法

- 自己的脚本 / 配置统一放在 **`custom/`** 目录
- 自己的 CI 用 **`.github/workflows/build-custom-image.yml`**（不要改上游的 `docker-build.yml`，上游更新它时你就零冲突）
- 代码里的改动点用注释标记，方便日后 grep 出全部自定义处：

  ```ts
  // [CUSTOM] 封面图渲染 —— 详见 CUSTOM.md
  ```

  任何时候都能一键列出所有自定义位置：

  ```bash
  grep -rn "\[CUSTOM\]" app/src server shared
  ```

- 每个改动**单独一个 commit**，语义清晰。上游冲突时能逐个 commit 定位，也能单独 revert。

---

## 常用操作

### 加一个定制改动

```bash
git checkout custom
# 改代码...
git add -p
git commit -m "feat(custom): 卡片显示封面图"
git push origin custom        # 触发 CI 构建镜像
```

### 同步上游更新

**日常方式（推荐）：GitHub Actions 自动同步**

- 每周一北京时间 11:00 自动跑一次，也可以去 Actions 页面手动触发 `Sync Upstream`
- 它在 GitHub 服务器上完成：拉上游 → 快进 main → 合并进 custom → 触发镜像构建
- 有冲突时会**自动开一个 Issue** 告诉你冲突文件清单，此时才需要本地介入

**本地方式（仅冲突时用）**

```bash
git fetch origin                    # 拿到 CI 同步过的 main（走 SSH，增量小）
git checkout custom
git merge origin/main               # 解决冲突后 git add + git commit
git push origin custom
```

> ⚠️ 不推荐在本地直接 `git fetch upstream`（国内网络拉完整上游历史极易卡死，实测 HTTPS 报 HTTP2 framing 错误）。上游同步一律交给 CI。

### 部署新版本到服务器

```bash
cd /www/wwwroot/blinko
docker compose pull && docker compose up -d
```

### 回滚到某个历史镜像

```bash
docker compose down
docker pull ghcr.io/baispace/blinko:sha-abc1234
# 临时把 compose 里的 image 改成该 tag
docker compose up -d
```

---

## 冲突应急

合并冲突时：

```bash
git merge --abort          # 退回合并前，什么都不改
```

解决冲突的流程：

```bash
# 1. 编辑冲突文件，处理 <<<<<<< / ======= / >>>>>>> 标记
# 2. git add <文件>
# 3. git commit --no-edit
```

建议开启 rerere，同样的冲突解决一次后会被记住、下次自动处理：

```bash
git config rerere.enabled true
git config rerere.autoupdate true
```

---

## 本地开发调试

源码开发需要 **bun**（官方 Dockerfile 用它构建）：

```bash
curl -fsSL https://bun.sh/install | bash
bun install
bun run dev
```

仅想在本地验证容器镜像（Mac 是 arm64）：

```bash
docker build -f dockerfile -t blinko-custom:local .
# 然后改 docker-compose.yml 的 image 为 blinko-custom:local
```

> ⚠️ **不要在 2核2G 服务器上构建镜像**。构建过程跑 `bun install` + Next.js 编译，内存峰值远超 2G，会 OOM 或卡死。镜像一律由 GitHub Actions 构建好推送，服务器只 pull。

---

## 部署与上游同步是两条独立的路

| 场景 | 做法 |
|------|------|
| 上游发了新版本，我想跟上 | Actions 里手动触发 `Sync Upstream`（或等每周一自动跑）→ 服务器 `docker compose pull` |
| 只想同步到某个发布版本 | `Sync Upstream` 的 `tag` 输入框填版本号（如 `v1.9.0`） |
| 上游改动和我的定制冲突 | CI 自动开 Issue 列出冲突文件，按「冲突应急」在本地处理后 push |
| 我想临时试个新功能，不确定要不要留 | 另开 `try/xxx` 分支，满意了再 cherry-pick 进 `custom` |
