FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install --global pnpm@10

COPY . .

RUN pnpm install --no-frozen-lockfile --prefer-offline
RUN PORT=4173 BASE_PATH=/ pnpm --filter @workspace/crypto-quant run build
RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production

CMD ["node", "lib/db/src/start.mjs"]
