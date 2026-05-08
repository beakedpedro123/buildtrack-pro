# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-slim AS deps

# Install pnpm via npm (avoids corepack PATH issues)
RUN npm install -g pnpm@9.12.0

WORKDIR /app

# Copy lockfiles first for layer caching
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDeps needed for build)
RUN pnpm install --no-frozen-lockfile

# ── Stage 2: Build ──────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Copy source
COPY . .

# Build server bundle + copy public assets + copy drizzle migrations
RUN pnpm build

# ── Stage 3: Production image ───────────────────────────────────────────────
FROM node:20-slim AS runner

# Install pnpm for production (needed if any scripts use it at runtime)
RUN npm install -g pnpm@9.12.0

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose API port (Railway uses PORT env var, default 3000)
EXPOSE 3000

ENV NODE_ENV=production

# Start the server
CMD ["node", "dist/index.js"]
