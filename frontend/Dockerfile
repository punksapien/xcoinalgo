# Use Node.js LTS with Alpine for smaller image size
FROM node:18-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS runner

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S frontend -u 1001

# Copy built application from builder stage
COPY --from=builder --chown=frontend:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

# Switch to non-root user
USER frontend

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000').then(r => r.ok ? process.exit(0) : process.exit(1))" || exit 1

# Start the application
CMD ["npm", "start"]