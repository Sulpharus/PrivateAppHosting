# Build context: repository root (the service imports the workspace package @mininode/gate).
#   docker build -f apps/nucbox-control/Dockerfile -t mininode-nucbox-control .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @mininode/nucbox-control... \
 && pnpm --filter @mininode/nucbox-control build

# Runtime: one bundled file, no node_modules, no package manager.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/nucbox-control/dist/main.mjs ./main.mjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "main.mjs"]
