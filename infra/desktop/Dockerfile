# The desktop host: portal, API, AI proxy and app gates on workerd, plus the mininode command
# (migrations, deploying apps, creating the first account). Build context: the repository root.
#   docker build -f infra/desktop/Dockerfile -t mininode-desktop-host:local .
FROM node:22-bookworm-slim
ENV CI=true
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @mininode/sdk build \
 && pnpm --filter @mininode/portal build \
 && node apps/desktop-host/src/bundle.ts /app/dist-workers
ENV NODE_ENV=production
WORKDIR /app/apps/desktop-host
EXPOSE 8787
CMD ["node", "src/main.ts"]
