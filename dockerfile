FROM node:22-slim AS builder

# Add debug information
RUN echo "Starting build phase..." && \
    node --version && \
    npm --version

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-distutils \      
    python3-dev \
    make \
    g++ \
    gcc \
    git \
    libssl-dev \           
    build-essential && \
    echo "Build dependencies installed"

WORKDIR /app

ENV NEXT_PRIVATE_STANDALONE true

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Modify schema.prisma to add binary targets
RUN echo "Modifying schema.prisma to add binary targets..." && \
    sed -i 's/provider      = "prisma-client-js"/provider      = "prisma-client-js"\n  binaryTargets = ["native", "debian-openssl-3.0.x"]/' ./prisma/schema.prisma && \
    echo "Modified schema.prisma:" && \
    cat ./prisma/schema.prisma | head -5

# Install pnpm and dependencies
RUN echo "Installing pnpm and dependencies..." && \
    npm install -g pnpm@9.12.2 && \
    if [ "$USE_MIRROR" = "true" ]; then \
        echo "Using mirror registry..." && \
        npm install -g nrm && \
        nrm use taobao; \
    fi && \
    pnpm install && \
    echo "Dependencies installed"

# Generate Prisma client
RUN echo "Generating Prisma client..." && \
    npx prisma generate && \
    echo "Prisma client generated"

# Check prisma engine path
RUN echo "Checking prisma engine path..." && \
    find node_modules -name "engines" -type d | grep prisma && \
    find node_modules -path "*prisma*" -name "query-engine*"

COPY . .

# Build application
RUN echo "Starting application build..." && \
    pnpm build && \
    echo "Application built" && \
    pnpm build-seed && \
    echo "Seed built"

# Create initialization script
RUN echo '// init.js - Initialization script for database migration and seeding\n\
const { execSync } = require("child_process");\n\
const path = require("path");\n\
const fs = require("fs");\n\
\n\
console.log("====== Starting initialization script ======");\n\
console.log("Current working directory:", process.cwd());\n\
console.log("Node.js version:", process.version);\n\
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "Not set");\n\
\n\
try {\n\
  // Check prisma directory and binary files\n\
  console.log("Checking Prisma environment...");\n\
  const prismaBin = path.join(process.cwd(), "node_modules/.bin/prisma");\n\
  const prismaExists = fs.existsSync(prismaBin);\n\
  console.log("Prisma CLI exists:", prismaExists);\n\
  \n\
  if (prismaExists && process.env.DATABASE_URL) {\n\
    // Execute database migration\n\
    console.log("\\nExecuting database migration...");\n\
    try {\n\
      const output = execSync(`npx prisma migrate deploy`, { encoding: "utf8" });\n\
      console.log("Migration output:", output.trim());\n\
    } catch (migrationError) {\n\
      console.error("Database migration failed:", migrationError.message);\n\
      // Continue execution, don\'t terminate on migration failure\n\
    }\n\
\n\
    // Execute data seeding\n\
    console.log("\\nExecuting data seeding...");\n\
    try {\n\
      require("./seed.js");\n\
      console.log("Data seeding completed successfully");\n\
    } catch (seedError) {\n\
      console.error("Data seeding failed:", seedError.message);\n\
    }\n\
  } else if (!process.env.DATABASE_URL) {\n\
    console.warn("DATABASE_URL environment variable not set, skipping database operations");\n\
  }\n\
\n\
  // Start application\n\
  console.log("\\nStarting application server...");\n\
  require("./server.js");\n\
} catch (error) {\n\
  console.error("Error during initialization:", error);\n\
  process.exit(1);\n\
}' > init.js

FROM gcr.io/distroless/nodejs22-debian12 AS runner

WORKDIR /app

# Copy application files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/seed.js ./seed.js
COPY --from=builder /app/init.js ./init.js

# Copy Prisma related files
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/@libsql ./node_modules/@libsql

# Set environment variables
ENV NODE_ENV=production \
    PORT=1111 \
    HOSTNAME=0.0.0.0

EXPOSE 1111

CMD ["node", "init.js"]
