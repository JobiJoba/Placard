# syntax=docker/dockerfile:1

# Static frontend assets are platform-independent. Build them once, without QEMU.
FROM --platform=$BUILDPLATFORM node:26-slim AS build-base
RUN npm install -g pnpm@12.4.1
WORKDIR /app

FROM build-base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile \
  --filter @placard/domain \
  --filter @placard/web

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/domain ./packages/domain
COPY apps/web ./apps/web
RUN pnpm --filter @placard/web build

# Runtime dependencies (including sharp) must match the target architecture.
FROM node:26-slim AS prod
RUN npm install -g pnpm@12.4.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json ./packages/domain/
COPY packages/module-sdk/package.json ./packages/module-sdk/
COPY apps/server/package.json ./apps/server/
COPY aspire-apphost/package.json ./aspire-apphost/
RUN pnpm install --frozen-lockfile --prod \
  --filter @placard/domain \
  --filter @placard/module-sdk \
  --filter @placard/server
COPY packages/domain/src ./packages/domain/src
COPY packages/module-sdk/src ./packages/module-sdk/src
COPY apps/server/src ./apps/server/src
COPY apps/server/drizzle ./apps/server/drizzle
COPY apps/server/bundled-plugins ./apps/server/bundled-plugins
COPY --from=build /app/apps/web/dist ./web-dist

FROM node:26-slim AS runner
ARG PLACARD_VERSION=development
ARG PLACARD_REVISION
ENV PLACARD_VERSION=$PLACARD_VERSION \
    PLACARD_REVISION=$PLACARD_REVISION
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    MEDIA_DIR=/data/media \
    PLACARD_MODULES_DIR=/data/modules \
    WEB_DIST_DIR=/app/web-dist
WORKDIR /app

COPY --from=prod --chown=node:node /app /app
RUN mkdir -p /data/media /data/modules && chown -R node:node /data
USER node

EXPOSE 3000
CMD ["node", "apps/server/src/main.ts"]
