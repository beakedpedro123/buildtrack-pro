FROM node:20-slim

RUN npm install -g pnpm@9.12.0

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Copy scripts directory needed by postinstall hooks
COPY scripts ./scripts

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
