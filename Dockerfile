# Stage 1: Build everything
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build all packages: shared -> server -> client
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine
WORKDIR /app

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=packages/shared --workspace=packages/server

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/client/dist packages/client/dist

# Ensure SQLite data directory exists
RUN mkdir -p packages/server/data

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
