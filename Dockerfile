FROM node:20-slim

# Install pnpm globally and ensure it's on PATH
RUN npm install -g pnpm@9.12.0
ENV PATH="/root/.local/share/pnpm:/usr/local/lib/node_modules/.bin:${PATH}"

WORKDIR /app

# Copy package files first for layer caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies (production + dev for build step)
RUN pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build the server bundle and copy drizzle migrations
RUN pnpm build

# Expose the API port
EXPOSE 3000

# Start the production server
CMD ["node", "dist/index.js"]
