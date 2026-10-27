#!/bin/sh
echo "Current Environment: $NODE_ENV"

SERVER_DIR=/app/server
PUBLIC_DIR="$SERVER_DIR/public"

# 镜像里不再全局安装 prisma（省 ~60MB），直接用本地 bin；找不到再回退 npx
PRISMA_BIN=/app/node_modules/.bin/prisma
if [ -x "$PRISMA_BIN" ]; then
  MIGRATE_CMD="\"$PRISMA_BIN\" migrate deploy"
else
  MIGRATE_CMD="npx prisma migrate deploy"
fi

# 迁移失败必须让容器停下来。
#
# 以前这里是裸执行：迁移报错被吞掉，容器照样起服务 —— 于是新代码对着旧
# schema 跑，页面上全是 "table does not exist" / "column does not exist"，
# 而日志里那条真正的错误早就被下一段输出冲掉了，看起来像「代码有 bug」。
#
# 现在失败即退出（restart: always 会重试），报错原样留在 docker logs 里。
if ! eval "$MIGRATE_CMD"; then
  echo ""
  echo "FATAL: 数据库迁移失败，容器不启动。"
  echo "       代码与数据库 schema 不一致时继续服务只会满屏报错。"
  echo "       常见原因：迁移链中断（某条迁移失败后后续全部落不下去）。"
  echo "       修复：prisma migrate resolve --rolled-back <失败的迁移名>，再重启容器。"
  exit 1
fi
node server/seed.js

# ---------------------------------------------------------------
# Pre-compress static assets.
#
# server/index.ts's servePrecompressed() middleware hands these .gz
# files straight to the client, so the compression cost is paid once
# at container start instead of on every request. On a 2-core box the
# difference is visible: ~2.5MB of uncompressed JS per first visit was
# showing up as multi-second "Waiting"/"Stalled" in DevTools.
#
# Two things to keep in mind when editing this block:
#   1. It must not `cd` anywhere. Docker's WORKDIR is /app, so a
#      leftover `cd` silently rewrites the path of the `node server/...`
#      commands below and the container crashes with MODULE_NOT_FOUND.
#   2. It must not shell out to `gzip`. The gzip applet is not
#      guaranteed to exist in node:20-alpine, and a missing binary
#      inside `... > "$1.gz" || true` still creates an empty .gz file,
#      which then poisons the cache. Node's zlib is always available.
# ---------------------------------------------------------------
if [ -d "$PUBLIC_DIR" ]; then
  echo "Pre-compressing static assets..."
  node -e '
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const root = process.argv[1];
let count = 0;
function walk(dir, rel) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".gz") continue;
    const abs = path.join(dir, entry.name);
    const relName = rel ? rel + "/" + entry.name : entry.name;
    if (entry.isDirectory()) { walk(abs, relName); continue; }
    if (!/\.(js|css|html|json|svg|woff2?)$/i.test(entry.name)) continue;
    const gz = abs + ".gz";
    try {
      if (fs.existsSync(gz) && fs.statSync(gz).mtimeMs >= fs.statSync(abs).mtimeMs) continue;
      const tmp = gz + ".tmp";
      fs.writeFileSync(tmp, zlib.gzipSync(fs.readFileSync(abs), { level: 9 }));
      fs.renameSync(tmp, gz);
      count++;
    } catch (err) {
      console.warn("  skip " + relName + ": " + err.message);
    }
  }
}
try {
  walk(root, "");
} catch (err) {
  console.warn("Pre-compression skipped: " + err.message);
}
console.log("Pre-compressed " + count + " file(s).");
' "$PUBLIC_DIR"
fi

if [ ! -f "$SERVER_DIR/index.js" ]; then
  echo "FATAL: $SERVER_DIR/index.js not found - refusing to start."
  exit 1
fi

node server/index.js
