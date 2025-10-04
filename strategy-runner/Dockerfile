# Use Node.js LTS with Alpine for smaller image size
FROM node:18-alpine

# Install Docker CLI for managing strategy containers
RUN apk add --no-cache docker-cli python3 py3-pip

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create necessary directories
RUN mkdir -p logs data

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S strategyrunner -u 1001

# Change ownership of app directory
RUN chown -R strategyrunner:nodejs /app

# Switch to non-root user
USER strategyrunner

# Expose port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8002/health').then(r => r.ok ? process.exit(0) : process.exit(1))" || exit 1

# Start the application
CMD ["npm", "start"]