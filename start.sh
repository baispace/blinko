#!/bin/sh
echo "Current Environment: $NODE_ENV"

SERVER_DIR=/app/server
PUBLIC_DIR="$SERVER_DIR/public"

npx prisma migrate deploy
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
