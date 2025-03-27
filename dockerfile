FROM node:22-slim AS builder

RUN if [ "$USE_MIRROR" = "true" ]; then \
      echo "Using mirror for apt..." && \
      sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list && \
      sed -i 's/security.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list; \
    fi && \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-distutils \      
    python3-dev \
    make \
    g++ \
    gcc \
    git \
    libssl-dev \           
    build-essential \
    curl \
    tzdata \
    openssl

WORKDIR /app

ENV NEXT_PRIVATE_STANDALONE true

COPY package.json pnpm-lock.yaml ./
COPY prisma ./

RUN npm install -g pnpm@9.12.2 prisma && \
    if [ "$USE_MIRROR" = "true" ]; then \
        echo "Using mirror registry..." && \
        npm install -g nrm && \
        nrm use taobao; \
    fi && \
    pnpm install

COPY . .
RUN pnpm build
RUN pnpm build-seed

RUN prisma generate

RUN echo 'const { execSync } = require("child_process"); \
try { \
  console.log("Running database migrations..."); \
  require("./node_modules/.bin/prisma").migrate.deploy(); \
  console.log("Running seed script..."); \
  require("./seed.js"); \
} catch (error) { \
  console.error("Error during initialization:", error); \
} \
console.log("Starting server..."); \
require("./server.js");' > /app/startup.js

FROM gcr.io/distroless/nodejs22-debian12:latest AS runner

WORKDIR /app

COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/seed.js ./seed.js
COPY --from=builder /app/resetpassword.js ./resetpassword.js
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/@libsql ./node_modules/@libsql
COPY --from=builder /app/startup.js ./startup.js

ENV NODE_ENV=production \
    PORT=1111 \
    HOSTNAME=0.0.0.0

EXPOSE 1111

# 使用新创建的启动脚本
CMD ["startup.js"]
