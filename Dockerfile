FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install --global pnpm@10

COPY . .

RUN pnpm install --no-frozen-lockfile --prefer-offline
RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

CMD ["sh", "-c", "node lib/db/src/bootstrap.mjs && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
