#!/bin/sh
echo "Current Environment: $NODE_ENV"

npx prisma migrate deploy
node server/seed.js

# ---------------------------------------------------------------
# Pre-compress static assets.
#
# server/index.ts's servePrecompressed() middleware hands these files
# straight to the client. Without this step every first visit would
# download ~2.5MB of uncompressed JS, and on a 2-core box that showed
# up as multi-second API latency (Stalled/Waiting in DevTools).
#
# Pre-compressing at container start costs a few seconds once, then
# serving is free. Idempotent: files are regenerated on every restart.
# ---------------------------------------------------------------
if [ -d /app/server/public ]; then
  echo "Pre-compressing static assets..."
  cd /app/server/public || exit 1
  find . -type f \
    \( -name '*.js' -o -name '*.css' -o -name '*.html' \) \
    ! -name '*.gz' \
    -exec sh -c 'gzip -c -9 -n "$1" > "$1.gz" 2>/dev/null || true' sh {} \;
  echo "Static assets pre-compressed."
fi

node server/index.js
