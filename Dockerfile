# Multi-stage Dockerfile for MCP Klipper Documentation Server

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install git for repository cloning
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Install git for repository cloning at runtime
RUN apk add --no-cache git

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Create data directory for git repository
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV GIT_LOCAL_PATH=/app/data/klipper-repo

# Expose port (if needed for health checks)
EXPOSE 3000

# Start the server
CMD ["node", "dist/server.js"]
