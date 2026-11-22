FROM public.ecr.aws/docker/library/node:22-slim AS base

ARG NPM_REGISTRY=https://registry.npmjs.org
ARG PRISMA_MIRROR=
ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY \
    PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    PRISMA_ENGINES_MIRROR=$PRISMA_MIRROR
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm config set registry $NPM_CONFIG_REGISTRY \
    && npm install -g pnpm@10.28.0

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm fetch --registry=$NPM_CONFIG_REGISTRY

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod --offline --registry=$NPM_CONFIG_REGISTRY

FROM base AS dependencies-dev
COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm fetch --registry=$NPM_CONFIG_REGISTRY

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --offline --registry=$NPM_CONFIG_REGISTRY

FROM base AS build
COPY package.json pnpm-lock.yaml ./
COPY --from=dependencies-dev /app/node_modules ./node_modules
COPY . .

RUN --mount=type=cache,target=/root/.cache/prisma pnpm exec prisma generate

RUN pnpm build

FROM base AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 appgroup \
    && useradd -u 1001 -g appgroup -M -s /usr/sbin/nologin appuser

WORKDIR /app

COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=build --chown=appuser:appgroup /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=build --chown=appuser:appgroup /app/prisma.config.ts ./prisma.config.ts

ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps" \
    PORT=3000

EXPOSE 3000

USER appuser

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/v1/ping', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["pnpm", "start:prod"]
