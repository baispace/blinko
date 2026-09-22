#!/usr/bin/env bash
#
# sync-upstream.sh — 把上游 Blinko 的更新同步进自己的定制分支
#
# 分支约定:
#   main   = 上游的纯净镜像（只快进，永不提交任何自定义内容）
#   custom = 我的全部定制改动（实际部署的就是这个分支）
#
# 用法:
#   ./custom/sync-upstream.sh                  # 同步到上游 main 最新
#   ./custom/sync-upstream.sh --tag v1.9.0     # 只同步到某个上游发布版本（更稳，推荐）
#   ./custom/sync-upstream.sh --dry-run        # 只预览会同步什么，不改动任何东西
#   ./custom/sync-upstream.sh --no-push        # 合并后不自动推送
#   ./custom/sync-upstream.sh --no-merge       # 只同步 main 并做冲突预警，不动 custom
#
# 冲突应急: 若合并中途出问题，用 git merge --abort 退回合并前状态
#
set -euo pipefail

# ---------- 配置（可用环境变量覆盖） ----------
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
MY_REMOTE="${MY_REMOTE:-origin}"
BRANCH_MAIN="${BRANCH_MAIN:-main}"
BRANCH_CUSTOM="${BRANCH_CUSTOM:-custom}"

TARGET_REF=""
DO_PUSH=1
DRY_RUN=0
DO_MERGE=1

# ---------- 输出helper ----------
c_info()  { printf '\033[36m%s\033[0m\n' "$*"; }
c_ok()    { printf '\033[32m%s\033[0m\n' "$*"; }
c_warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
c_err()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
c_title() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag)       TARGET_REF="${2:-}"; [ -n "$TARGET_REF" ] || { c_err "--tag 需要一个版本号，例如 --tag v1.9.0"; exit 1; }; shift 2 ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --no-push)   DO_PUSH=0; shift ;;
    --no-merge)  DO_MERGE=0; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           c_err "未知参数: $1"; echo; usage; exit 1 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

# ---------- 0. 前置检查 ----------
c_title "环境检查"

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  c_err "没有找到 remote '$UPSTREAM_REMOTE'。先执行："
  echo "    git remote add $UPSTREAM_REMOTE https://github.com/blinkospace/blinko.git"
  exit 1
fi
c_ok "upstream remote: $(git remote get-url "$UPSTREAM_REMOTE")"

if ! git remote get-url "$MY_REMOTE" >/dev/null 2>&1; then
  c_err "没有找到自己的 remote '$MY_REMOTE'（fork 仓库）"
  exit 1
fi
c_ok "自己的 remote:  $(git remote get-url "$MY_REMOTE")"

if [ -n "$(git status --porcelain)" ]; then
  c_err "工作区有未提交的改动，先提交或 stash 再同步（脚本不替你处理脏工作区）："
  git status --short
  exit 1
fi
c_ok "工作区干净"

# 确定目标 ref：默认上游 main 最新，--tag 则用指定发布版本
if [ -n "$TARGET_REF" ]; then
  TARGET="refs/tags/$TARGET_REF"
  c_info "目标: 上游发布版本 $TARGET_REF"
else
  TARGET="$UPSTREAM_REMOTE/$BRANCH_MAIN"
  c_info "目标: 上游 $BRANCH_MAIN 最新"
fi

# ---------- 1. 拉取上游 ----------
c_title "拉取上游更新"
if [ "$DRY_RUN" = "1" ]; then
  c_warn "[dry-run] 跳过实际 fetch"
else
  git fetch "$UPSTREAM_REMOTE" --tags --prune
fi

if [ -n "$TARGET_REF" ]; then
  git rev-parse --verify --quiet "$TARGET" >/dev/null || { c_err "上游不存在标签 $TARGET_REF"; exit 1; }
  TARGET_SHA="$(git rev-parse --short "$TARGET")"
else
  TARGET_SHA="$(git rev-parse --short "$TARGET")"
fi
c_ok "目标 commit: $TARGET_SHA  ($(git log -1 --format=%s "$TARGET"))"

# ---------- 2. 同步 main（只快进，绝不产生合并提交） ----------
c_title "同步 $BRANCH_MAIN（纯净镜像）"

if [ "$DRY_RUN" = "0" ]; then
  git checkout "$BRANCH_MAIN" >/dev/null 2>&1
  git merge --ff-only "$TARGET" 2>&1 | tail -3 || {
    c_err "$BRANCH_MAIN 无法快进到目标。可能你曾在 main 上提交过东西——"
    c_err "main 必须与上游完全一致，把你的改动挪到 $BRANCH_CUSTOM 上再试。"
    exit 1
  }
  c_ok "$BRANCH_MAIN 已快进到 $TARGET_SHA"
else
  c_warn "[dry-run] 跳过 main 快进"
fi

# ---------- 3. 冲突预警：上游改了哪些「我也改过的文件」 ----------
c_title "冲突预警"

BASE="$(git merge-base "$BRANCH_CUSTOM" "$TARGET" 2>/dev/null || true)"
if [ -z "$BASE" ]; then
  c_warn "找不到共同祖先（可能 custom 分支还没建），跳过预警"
else
  UP_TMP="$(mktemp)"; MY_TMP="$(mktemp)"
  git diff --name-only "$BASE".."$TARGET"      | sort -u > "$UP_TMP"
  git diff --name-only "$BASE".."$BRANCH_CUSTOM" | sort -u > "$MY_TMP"
  HOT="$(comm -12 "$UP_TMP" "$MY_TMP" || true)"

  UP_COUNT="$(wc -l < "$UP_TMP" | tr -d ' ')"
  MY_COUNT="$(wc -l < "$MY_TMP" | tr -d ' ')"
  c_info "上游本次改了 $UP_COUNT 个文件，你累计改了 $MY_COUNT 个文件"

  if [ -n "$HOT" ]; then
    c_warn "以下文件双方都动过 —— 这是冲突高危区，请重点看："
    echo "$HOT" | sed 's/^/    /'
  else
    c_ok "无交集：上游的改动和你的定制没有重叠，合并应当是干净的"
  fi
  rm -f "$UP_TMP" "$MY_TMP"
fi

# ---------- 4. 上游本次带来的提交 ----------
c_title "上游本次新增的提交"
if [ -n "$BASE" ]; then
  # 注意: head 会提前关闭管道触发 SIGPIPE，set -o pipefail 下必须吞掉这个非零退出
  git log --oneline --no-decorate "$BASE".."$TARGET" | head -30 || true
  TOTAL="$(git rev-list --count "$BASE".."$TARGET")"
  if [ "$TOTAL" -gt 30 ]; then c_info "... 共 $TOTAL 个提交"; fi
  if [ "$TOTAL" -eq 0 ]; then c_ok "已经是最新，无需合并"; fi
fi

if [ "$DO_MERGE" = "0" ]; then
  c_warn "--no-merge 已指定，停在预警阶段。当前分支：$(git rev-parse --abbrev-ref HEAD)"
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  c_warn "[dry-run] 到此为止，未做任何改动"
  git checkout "$BRANCH_CUSTOM" >/dev/null 2>&1 || true
  exit 0
fi

# ---------- 5. 合并进 custom ----------
c_title "合并进 $BRANCH_CUSTOM"
git checkout "$BRANCH_CUSTOM" >/dev/null

# 打一个标记，记住这次同步基于上游哪个点，便于日后追溯
if git merge "$TARGET" --no-edit; then
  c_ok "合并成功，无冲突"
else
  c_err "有冲突需要手动解决。冲突文件："
  git diff --name-only --diff-filter=U | sed 's/^/    /'
  echo
  c_info "处理办法："
  echo "    1. 编辑上面这些文件，找到 <<<<<<< / ======= / >>>>>>> 标记，保留你要的代码"
  echo "    2. git add <文件>"
  echo "    3. git commit --no-edit     # 完成合并"
  echo "    4. ./custom/sync-upstream.sh --no-merge   # 重新走一遍确认"
  echo
  c_info "不想现在处理就退回：git merge --abort"
  exit 2
fi

# ---------- 6. 推送到自己的 fork ----------
c_title "推送到 fork"
if [ "$DO_PUSH" = "1" ]; then
  git push "$MY_REMOTE" "$BRANCH_MAIN"
  git push "$MY_REMOTE" "$BRANCH_CUSTOM"
  c_ok "已推送。CI 会自动构建镜像（若已开启 Actions）"
  c_info "镜像地址: ghcr.io/<你的用户名>/blinko:custom"
else
  c_warn "--no-push 已指定，改动只在本地"
  echo "    手动推送: git push $MY_REMOTE $BRANCH_CUSTOM"
fi

c_title "完成"
echo "  当前分支: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
echo "  上游基线: $TARGET_SHA"
echo
c_info "下一步：服务器上拉新镜像"
echo "    docker compose pull && docker compose up -d"
