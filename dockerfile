# Build Stage
FROM oven/bun:1.2.8 AS builder

# Add Build Arguments
ARG USE_MIRROR=false

WORKDIR /app

# Set Sharp environment variables to speed up ARM installation
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV npm_config_sharp_binary_host="https://npmmirror.com/mirrors/sharp"
ENV npm_config_sharp_libvips_binary_host="https://npmmirror.com/mirrors/sharp-libvips"

# Set Prisma environment variables to optimize installation
ENV PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

# Copy Project Files
COPY . .

# Configure Mirror Based on USE_MIRROR Parameter
RUN if [ "$USE_MIRROR" = "true" ]; then \
        echo "Using Taobao Mirror to Install Dependencies" && \
        echo '{ "install": { "registry": "https://registry.npmmirror.com" } }' > .bunfig.json; \
    else \
        echo "Using Default Mirror to Install Dependencies"; \
    fi

# Pre-install Sharp for ARM architecture
RUN if [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "arm64" ]; then \
        echo "Detected ARM architecture, installing sharp platform-specific dependencies..." && \
        mkdir -p /tmp/sharp-cache && \
        export SHARP_CACHE_DIRECTORY=/tmp/sharp-cache && \
        bun install --platform=linux --arch=arm64 sharp@0.34.1 --no-save --unsafe-perm || \
        bun install --force @img/sharp-linux-arm64 --no-save; \
    fi

# Install Dependencies and Build App
RUN bun install --unsafe-perm
RUN bunx prisma generate
RUN bun run build:web
RUN bun run build:seed

COPY start.sh ./start.sh
RUN chmod +x ./start.sh && \
    ls -la start.sh


FROM node:20-alpine as init-downloader

WORKDIR /app

RUN wget -qO /app/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_$(uname -m) && \
    chmod +x /app/dumb-init && \
    rm -rf /var/cache/apk/*


# Runtime Stage - Using Alpine as required
FROM node:20-alpine AS runner

# Add Build Arguments
ARG USE_MIRROR=false

WORKDIR /app

# Environment Variables
ENV NODE_ENV=production
# If there is a proxy or load balancer behind HTTPS, you may need to disable secure cookies
ENV DISABLE_SECURE_COOKIE=false
# Set Trust Proxy
ENV TRUST_PROXY=1
# Set Sharp environment variables
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV npm_config_sharp_binary_host="https://npmmirror.com/mirrors/sharp"
ENV npm_config_sharp_libvips_binary_host="https://npmmirror.com/mirrors/sharp-libvips"

# ---------------------------------------------------------------------------
# 运行时依赖安装 + 瘦身。
#
# 关键约束：apk add / npm install / 清理必须发生在**同一个 RUN** 里。
# Docker 的每一层都是只读快照，跨 RUN 的 `apk del` 只会新增一层白名单，
# 前面那层装进去的编译工具链（python3 + gcc + vips-dev，约 500MB）永远
# 留在镜像里。所以这里一次性装完、编译完、再原地删干净。
# ---------------------------------------------------------------------------
# Copy Build Artifacts and Necessary Files（必须在上面的 RUN 之前，
# 因为 RUN 里要 prune /app/server/*.map 并对 .prisma/client 做平台裁剪）
COPY --from=builder /app/dist ./server
COPY --from=builder /app/server/lute.min.js ./server/lute.min.js
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=builder /app/start.sh ./
COPY --from=init-downloader /app/dumb-init /usr/local/bin/dumb-init

RUN chmod +x ./start.sh && \
    apk add --no-cache openssl vips python3 py3-setuptools make g++ gcc libc-dev linux-headers && \
    if [ "$USE_MIRROR" = "true" ]; then \
        echo "Using Taobao Mirror to Install Dependencies" && \
        npm config set registry https://registry.npmmirror.com; \
    else \
        echo "Using Default Mirror to Install Dependencies"; \
    fi && \
    \
    if [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "arm64" ]; then \
        echo "Detected ARM architecture, installing sharp platform-specific dependencies..." && \
        mkdir -p /tmp/sharp-cache && \
        export SHARP_CACHE_DIRECTORY=/tmp/sharp-cache && \
        npm install --platform=linux --arch=arm64 sharp@0.34.1 --no-save --unsafe-perm || \
        npm install --force @img/sharp-linux-arm64 --no-save; \
    fi && \
    \
    echo "Installing additional dependencies..." && \
    npm install @node-rs/crc32 lightningcss sharp@0.34.1 prisma@5.21.1 && \
    npm install sqlite3@5.1.7 && \
    npm install --legacy-peer-deps llamaindex @langchain/community@0.3.40 && \
    npm install @libsql/client @libsql/core && \
    npx prisma generate && \
    \
    echo "Pruning image size..." && \
    ENGINE_KEEP=$(uname -m | sed 's/x86_64/linux-musl-openssl-3.0.x/; s/aarch64/linux-musl-arm64-openssl-3.0.x/') && \
    echo "  keep prisma engine variant: $ENGINE_KEEP" && \
    find /app/node_modules/@prisma/engines /app/node_modules/.prisma/client -type f -name '*.node' ! -name "*$ENGINE_KEEP*" -delete 2>/dev/null || true && \
    find /app/node_modules/@prisma/engines /app/node_modules/.prisma/client -type f -name 'schema-engine*' ! -name "*$ENGINE_KEEP*" -delete 2>/dev/null || true && \
    rm -f /app/server/*.map && \
    rm -rf /app/node_modules/@img/sharp-libvips-linux-x64 \
           /app/node_modules/@img/sharp-linux-x64 \
           /app/node_modules/lightningcss-linux-x64-gnu && \
    apk del python3 py3-setuptools make g++ gcc libc-dev linux-headers && \
    rm -rf /tmp/* /var/cache/apk/* /root/.npm /root/.cache

# Expose Port (Adjust According to Actual Application)
EXPOSE 1111

CMD ["/usr/local/bin/dumb-init", "--", "/bin/sh", "-c", "./start.sh"]
