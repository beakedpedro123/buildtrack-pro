FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the server
RUN npm run build

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
