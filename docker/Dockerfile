# syntax=docker/dockerfile:1
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-slim AS base

LABEL org.opencontainers.image.description="Graph-Kit - Prisma-like DX for graph databases"
LABEL org.opencontainers.image.url="https://github.com/frontal-labs/graph-kit"
LABEL org.opencontainers.image.source="https://github.com/frontal-labs/graph-kit.git"

WORKDIR /app

ENV NODE_ENV=production \
    PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH \
    COREPACK_ENABLE_STRICT=0

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    python3 \
    make \
    g++ \
    libc6-dev \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.15.9 --activate

FROM base AS deps

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm install --frozen-lockfile --prefer-offline

FROM base AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 graph-kit

COPY --from=builder /app/packages ./packages
COPY --from=builder /app/packages/cli ./packages/cli
COPY --from=builder /app/dist ./dist 2>/dev/null || true
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER graph-kit

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "packages/cli/dist/index.mjs"]
