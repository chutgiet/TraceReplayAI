# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json tsconfig.json turbo.json ./
COPY packages/event-schema/package.json packages/event-schema/
COPY packages/common/package.json packages/common/
COPY packages/connectors-core/package.json packages/connectors-core/
COPY packages/redaction/package.json packages/redaction/
COPY packages/replay-engine/package.json packages/replay-engine/
COPY packages/graph-model/package.json packages/graph-model/
COPY packages/sdk-typescript/package.json packages/sdk-typescript/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
COPY services/ingest-api/package.json services/ingest-api/
COPY services/normalizer/package.json services/normalizer/
COPY services/query-service/package.json services/query-service/
COPY services/worker/package.json services/worker/
COPY tests/package.json tests/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build all packages & services ────────────────────────────────────
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy entire deps workspace (preserves pnpm store + symlink structure)
COPY --from=deps /app ./

# Overlay source code on top of installed deps
COPY . .

RUN pnpm turbo run build --filter='!@tracereplay/web'

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy full workspace (built) — pnpm workspace needs the manifests
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/turbo.json ./
COPY --from=build /app/tsconfig.base.json /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules

# Copy built packages
COPY --from=build /app/packages ./packages

# Copy built services
COPY --from=build /app/services/ingest-api ./services/ingest-api
COPY --from=build /app/services/normalizer ./services/normalizer
COPY --from=build /app/services/query-service ./services/query-service
COPY --from=build /app/services/worker ./services/worker

# Copy migration scripts
COPY --from=build /app/infrastructure ./infrastructure
COPY --from=build /app/scripts ./scripts

# Default to info logging
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# The specific service to run is set via docker-compose command
CMD ["node", "dist/index.js"]
