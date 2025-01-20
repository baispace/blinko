FROM node:20-alpine3.21 AS builder

RUN ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3
WORKDIR /app

ENV NEXT_PRIVATE_STANDALONE true

COPY package.json pnpm-lock.yaml ./
COPY prisma ./

RUN npm install -g pnpm && \
    if [ "$USE_MIRROR" = "true" ]; then \
        echo "Using mirror registry..." && \
        npm install -g nrm && \
        nrm use taobao; \
    fi && \
    pnpm install

COPY . .
RUN pnpm build
RUN pnpm build-seed



FROM node:20-alpine3.21 AS runner

# Fix alpine3.21 openssl issue
RUN ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3
  
# RUN apk add --no-cache postgresql14-client
RUN npm install -g prisma
RUN apk add --no-cache curl tzdata
WORKDIR /app

COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/seed.js ./seed.js
COPY --from=builder /app/resetpassword.js ./resetpassword.js

ENV NODE_ENV=production
ENV PORT=1111

EXPOSE 1111

CMD ["sh", "-c", "prisma migrate deploy && node seed.js && node server.js"]
