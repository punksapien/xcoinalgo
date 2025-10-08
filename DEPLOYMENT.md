# Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Redis Setup](#redis-setup)
6. [Running the Application](#running-the-application)
7. [Production Deployment](#production-deployment)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

1. **Node.js** (v18 or higher)
```bash
node --version  # Should be v18+
npm --version
```

2. **Python** (v3.8 or higher)
```bash
python3 --version  # Should be 3.8+
pip3 --version
```

3. **Redis** (v6 or higher)
```bash
redis-server --version  # Should be 6.0+
```

4. **Git**
```bash
git --version
```

### Installing Prerequisites

**macOS (Homebrew):**
```bash
brew install node python@3.11 redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install nodejs npm python3 python3-pip redis-server
```

**Windows (Chocolatey):**
```bash
choco install nodejs python redis
```

---

## Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd coindcx-trading-platform
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 4. Install Python Dependencies

```bash
cd ../backend
pip3 install -r requirements.txt
```

**Example requirements.txt:**
```
pandas==2.0.0
numpy==1.24.0
requests==2.31.0
python-dotenv==1.0.0
```

---

## Environment Configuration

### Backend Environment Variables

**File:** `backend/.env`

**Full example (see `.env.example` for complete reference):**

```env
# Database (PostgreSQL - Production)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"

# For local development with SQLite:
# DATABASE_URL="file:./dev.db"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="24h"

# Encryption (MUST be exactly 32 characters)
ENCRYPTION_KEY="change-this-to-32-character-key"

# Server
PORT=3001
NODE_ENV="production"

# CORS
FRONTEND_URL="https://yourdomain.com"

# Email Configuration (Resend)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM="Your App <noreply@yourdomain.com>"

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SESSION_SECRET=your-session-secret-key

# Redis (optional for caching)
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD=""
```

**Generate Secure Secrets:**
```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key (32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Session Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend Environment Variables

**File:** `frontend/.env.local`

```env
# API URL
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### Security Best Practices

1. **Never commit .env files** - Add to .gitignore
2. **Use different secrets per environment** (dev, staging, prod)
3. **Rotate JWT secrets** periodically
4. **Use strong passwords** for Redis in production
5. **Enable HTTPS** in production

---

## Database Setup

### Database Options

The platform supports **both SQLite and PostgreSQL**:

- **SQLite**: Quick local development, no setup required
- **PostgreSQL**: Production-ready, recommended for deployment

### PostgreSQL Setup (Recommended for Production)

**1. Configure DATABASE_URL in `.env`:**

```env
# PostgreSQL format:
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

**Common cloud providers:**
- **AWS RDS**: `postgresql://user:pass@mydb.xxx.us-east-1.rds.amazonaws.com:5432/xcoinalgo`
- **Supabase**: `postgresql://postgres:pass@db.projectref.supabase.co:5432/postgres`
- **Railway**: `postgresql://postgres:pass@containers-us-west.railway.app:1234/railway`
- **DigitalOcean**: `postgresql://doadmin:pass@db-postgresql-nyc3-xxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require`
- **Render**: `postgresql://user:pass@dpg-xxxxx.oregon-postgres.render.com/dbname`

See `.env.example` for more examples.

**2. Initialize Prisma:**

```bash
cd backend
npx prisma generate
```

**3. Run Migrations:**

```bash
# This will create all tables in your PostgreSQL database
npx prisma migrate deploy
```

For development with schema changes:
```bash
npx prisma migrate dev --name your_migration_name
```

### SQLite Setup (Local Development Only)

**1. Configure DATABASE_URL in `.env`:**

```env
DATABASE_URL="file:./dev.db"
```

**2. Initialize Prisma:**

```bash
cd backend
npx prisma generate
```

**3. Run Migrations:**

```bash
npx prisma migrate dev --name init
```

This creates:
- SQLite database at `backend/prisma/dev.db`
- All tables defined in schema

**Note:** SQLite is NOT recommended for production due to:
- Limited concurrent write support
- File-based storage (not scalable)
- No built-in replication

### 4. Seed Database (Optional)

**File:** `backend/prisma/seed.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create sample user
  const user = await prisma.user.create({
    data: {
      email: 'demo@example.com',
      password: '$2b$10$...' // Use bcrypt to hash
    }
  });

  // Create sample strategy
  await prisma.strategy.create({
    data: {
      userId: user.id,
      name: 'SMA Crossover',
      code: 'sma_crossover',
      description: 'Simple Moving Average crossover strategy',
      author: 'Demo User',
      version: '1.0.0',
      strategyCode: `
def main(data):
    # Strategy logic here
    return {"action": "HOLD"}
      `,
      executionConfig: {
        symbol: 'BTCUSDT',
        resolution: '5',
        lookbackPeriod: 100
      },
      isActive: true,
      isPublic: true
    }
  });

  console.log('Database seeded successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

**Run seed:**
```bash
npx prisma db seed
```

### 4. Prisma Studio (Database GUI)

```bash
npx prisma studio
```

Opens http://localhost:5555 with a GUI to browse/edit data.

---

## Redis Setup (Optional)

**Note:** Redis is used for distributed locking and caching in multi-worker deployments. For single-server deployments, Redis is **optional** but recommended.

### Start Redis

**Development:**
```bash
redis-server
```

**Background (Linux):**
```bash
sudo systemctl start redis
sudo systemctl enable redis  # Auto-start on boot
```

**macOS (Homebrew):**
```bash
brew services start redis
```

### Verify Redis is Running

```bash
redis-cli ping
# Should return: PONG
```

### Cloud Redis Options

For production, consider managed Redis:
- **AWS ElastiCache**: Fully managed Redis
- **Redis Cloud**: Official managed service
- **Railway**: Redis addon available
- **DigitalOcean**: Managed Redis clusters
- **Upstash**: Serverless Redis with free tier

### Redis Configuration

**File:** `/etc/redis/redis.conf` (Linux) or `/usr/local/etc/redis.conf` (macOS)

**Production settings:**
```conf
# Enable password
requirepass your-strong-password

# Bind to specific IP (not 0.0.0.0)
bind 127.0.0.1

# Persistence
save 900 1      # Save after 900s if 1 key changed
save 300 10     # Save after 300s if 10 keys changed
save 60 10000   # Save after 60s if 10000 keys changed

# Max memory
maxmemory 256mb
maxmemory-policy allkeys-lru

# Log level
loglevel notice
```

### Redis CLI Commands

```bash
# Connect to Redis
redis-cli

# View all keys
KEYS *

# Get strategy settings
GET strategy:abc123:settings

# View candle strategies
SMEMBERS candle:BTCUSDT:5:strategies

# Monitor commands in real-time
MONITOR

# Check memory usage
INFO memory
```

---

## Running the Application

### Development Mode

**Terminal 1: Backend API (with built-in workers)**
```bash
cd backend
npm run dev
```

The backend now includes:
- Express API server (port 3001)
- Strategy executor health monitoring
- Order monitoring service (checks SL/TP every minute)

**Terminal 2: Frontend**
```bash
cd frontend
npm run dev
```

**Terminal 3 (Optional): Redis**
```bash
redis-server
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/health
- Prisma Studio: `npx prisma studio` → http://localhost:5555

### Production Mode

**Build Backend:**
```bash
cd backend
npm run build
```

**Build Frontend:**
```bash
cd frontend
npm run build
```

**Start Backend:**
```bash
cd backend
npm start
```

**Start Frontend:**
```bash
cd frontend
npm start
```

---

## Production Deployment

### Option 1: PM2 (Process Manager)

**Install PM2:**
```bash
npm install -g pm2
```

**PM2 Ecosystem File:**

**File:** `ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'backend-api',
      script: './backend/dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'strategy-scheduler',
      script: './backend/dist/workers/strategy-scheduler.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        WORKER_ID: 'scheduler-1'
      }
    },
    {
      name: 'frontend',
      script: 'npm',
      args: 'start',
      cwd: './frontend',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
```

**Start with PM2:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**PM2 Commands:**
```bash
pm2 list              # List all processes
pm2 logs              # View logs
pm2 logs backend-api  # View specific app logs
pm2 restart all       # Restart all apps
pm2 stop all          # Stop all apps
pm2 delete all        # Delete all apps
pm2 monit             # Real-time monitoring
```

### Option 2: Docker

**Dockerfile (Backend):**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
```

**Dockerfile (Frontend):**

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=file:/data/prod.db
      - REDIS_HOST=redis
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./backend/prisma:/app/prisma
    depends_on:
      - redis

  scheduler:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: node dist/workers/strategy-scheduler.js
    environment:
      - REDIS_HOST=redis
      - WORKER_ID=scheduler-1
    depends_on:
      - redis
      - backend

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:3001
    depends_on:
      - backend

volumes:
  redis_data:
```

**Start with Docker:**
```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

### Option 3: Cloud Platforms

**Vercel (Frontend):**
```bash
cd frontend
vercel deploy
```

**Railway/Render (Backend + Redis):**
1. Connect GitHub repo
2. Set environment variables
3. Deploy automatically on push

**AWS/GCP/Azure:**
- Use EC2/Compute Engine/VMs
- Install Node.js, Redis, PM2
- Set up reverse proxy (Nginx)
- Enable HTTPS (Let's Encrypt)

---

## Monitoring

### Logging

**Backend Logging (Winston):**

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

export { logger };
```

**Usage:**
```typescript
logger.info('Strategy execution started', { strategyId, symbol });
logger.error('Execution failed', { error: err.message, strategyId });
```

### Health Checks

**Backend Health Endpoint:**

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redis.status === 'ready',
    database: prisma.$queryRaw`SELECT 1` ? true : false
  });
});
```

### Metrics

**Track Key Metrics:**
1. Execution success rate
2. API response times
3. Error rates
4. Redis memory usage
5. Database query times
6. Active subscriptions

**Example Metrics Endpoint:**

```typescript
app.get('/metrics', authenticateAdmin, async (req, res) => {
  const [
    totalExecutions,
    failedExecutions,
    activeSubscriptions,
    totalTrades
  ] = await Promise.all([
    prisma.strategyExecution.count(),
    prisma.strategyExecution.count({ where: { status: 'FAILED' } }),
    prisma.strategySubscription.count({ where: { isActive: true, isPaused: false } }),
    prisma.trade.count()
  ]);

  res.json({
    executions: {
      total: totalExecutions,
      failed: failedExecutions,
      successRate: ((totalExecutions - failedExecutions) / totalExecutions * 100).toFixed(2)
    },
    subscriptions: {
      active: activeSubscriptions
    },
    trades: {
      total: totalTrades
    }
  });
});
```

---

## Troubleshooting

### Common Issues

**1. Redis Connection Failed**

```
Error: Redis connection to localhost:6379 failed
```

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# If not running, start it
redis-server

# Check if port is in use
lsof -i :6379
```

**2. Database Locked (SQLite)**

```
Error: SQLITE_BUSY: database is locked
```

**Solution:**
- SQLite doesn't support concurrent writes well
- For production, **migrate to PostgreSQL** (see Database Setup section above)
- Update `schema.prisma` provider to `postgresql`
- Set `DATABASE_URL` to PostgreSQL connection string
- Run `npx prisma migrate deploy`

**3. Port Already in Use**

```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution:**
```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>

# Or use different port
PORT=3002 npm start
```

**4. Prisma Client Not Generated**

```
Error: @prisma/client did not initialize yet
```

**Solution:**
```bash
npx prisma generate
```

**5. Python Strategy Execution Fails**

```
Error: Python process exited with code 1
```

**Solution:**
```bash
# Check Python is accessible
which python3

# Test strategy executor manually
python3 backend/strategy_executor.py --code test --symbol BTCUSDT --resolution 5

# Check Python dependencies
pip3 install -r backend/requirements.txt
```

**6. CORS Errors**

```
Access to fetch at 'http://localhost:3001' has been blocked by CORS
```

**Solution (backend):**
```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
```

### Debug Mode

**Backend:**
```bash
DEBUG=* npm run dev
```

**View all Redis commands:**
```bash
redis-cli MONITOR
```

**Prisma query logging:**
```typescript
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

---

## Performance Optimization

### Backend

1. **Enable Redis Persistence:**
```conf
# redis.conf
appendonly yes
```

2. **Database Indexing:**
Already defined in schema:
```prisma
@@index([userId])
@@index([strategyId])
```

3. **API Response Caching:**
```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 }); // 5 min TTL

app.get('/api/strategies', async (req, res) => {
  const cached = cache.get('strategies');
  if (cached) {
    return res.json(cached);
  }

  const strategies = await prisma.strategy.findMany();
  cache.set('strategies', strategies);
  res.json(strategies);
});
```

4. **Horizontal Scaling:**
Run multiple scheduler workers:
```bash
WORKER_ID=worker-1 npm run worker &
WORKER_ID=worker-2 npm run worker &
```

### Frontend

1. **Image Optimization:**
```typescript
import Image from 'next/image';

<Image src="/logo.png" width={200} height={50} alt="Logo" />
```

2. **Code Splitting:**
```typescript
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <p>Loading...</p>,
});
```

3. **Memoization:**
```typescript
import { useMemo } from 'react';

const expensiveValue = useMemo(() => {
  return heavyComputation(data);
}, [data]);
```

---

## Security Checklist

- [ ] Use HTTPS in production
- [ ] Set strong JWT secret
- [ ] Enable Redis password
- [ ] Use environment variables (no hardcoded secrets)
- [ ] Implement rate limiting
- [ ] Sanitize user inputs
- [ ] Use prepared statements (Prisma does this)
- [ ] Enable CORS with specific origins
- [ ] Set up firewall rules
- [ ] Regular security updates
- [ ] Monitor error logs
- [ ] Implement API authentication
- [ ] Use secure session cookies

---

## Backup & Recovery

### Database Backup

**SQLite:**
```bash
cp backend/prisma/dev.db backend/prisma/backup-$(date +%Y%m%d).db
```

**PostgreSQL:**
```bash
# Backup entire database
pg_dump -U username -d database_name > backup.sql

# Backup with compression
pg_dump -U username -d database_name | gzip > backup-$(date +%Y%m%d).sql.gz

# Restore from backup
psql -U username -d database_name < backup.sql
```

**Cloud PostgreSQL Backups:**
- **AWS RDS**: Automated snapshots enabled by default
- **Supabase**: Daily backups included
- **Railway**: Point-in-time recovery available
- **DigitalOcean**: Automated daily backups

### Redis Backup

```bash
# Manual save
redis-cli SAVE

# Copy RDB file
cp /var/lib/redis/dump.rdb backup-$(date +%Y%m%d).rdb
```

### Automated Backups

```bash
# Cron job (daily at 2 AM)
0 2 * * * /path/to/backup-script.sh
```

**backup-script.sh:**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
cp /app/prisma/prod.db /backups/db-$DATE.db
cp /var/lib/redis/dump.rdb /backups/redis-$DATE.rdb

# Keep only last 7 days
find /backups -type f -mtime +7 -delete
```

---

## Summary

### Development Setup (Quick Start)

1. **Prerequisites**: Install Node.js v18+, Python 3.8+
2. **Clone & Install**:
   ```bash
   git clone <repo>
   cd coindcx-trading-platform/backend && npm install
   cd ../frontend && npm install
   ```
3. **Configure Environment**: Copy `.env.example` to `.env` and update values
4. **Database Setup**:
   ```bash
   cd backend
   npx prisma generate
   npx prisma migrate dev --name init
   ```
5. **Run Application**:
   - Backend: `cd backend && npm run dev`
   - Frontend: `cd frontend && npm run dev`
6. **Access**: Frontend at http://localhost:3000, API at http://localhost:3001

### Production Checklist

**Database:**
- [ ] Migrate to PostgreSQL (not SQLite)
- [ ] Set `DATABASE_URL` with PostgreSQL connection string
- [ ] Run `npx prisma migrate deploy`
- [ ] Enable automated backups

**Security:**
- [ ] Generate secure secrets (JWT, encryption, session)
- [ ] Use HTTPS with SSL certificate
- [ ] Enable CORS for specific origins only
- [ ] Set `NODE_ENV=production`
- [ ] Encrypt broker API credentials (AES-256-GCM)

**Infrastructure:**
- [ ] Use process manager (PM2 or Docker)
- [ ] Set up Redis for caching (optional but recommended)
- [ ] Configure environment variables (never hardcode)
- [ ] Enable logging and monitoring
- [ ] Set up health check endpoints

**Trading Platform Specifics:**
- [ ] Configure CoinDCX API credentials securely
- [ ] Test stop loss/take profit order execution
- [ ] Verify order monitoring service (runs every minute)
- [ ] Test backtest engine with historical data
- [ ] Monitor strategy execution health

**Monitoring:**
- [ ] Set up log aggregation
- [ ] Monitor API response times
- [ ] Track strategy execution success rates
- [ ] Alert on order failures
- [ ] Monitor database performance

### Key Features Implemented

**Trading Infrastructure:**
- Real CoinDCX API integration
- Multi-tenant strategy execution
- Stop loss & take profit orders (separate limit orders)
- Automated order monitoring (1-minute intervals)
- Risk management with position sizing

**Analytics & Testing:**
- Backtest engine with historical data
- Performance metrics (Sharpe, drawdown, win rate)
- Real-time P&L tracking
- Trade history and analytics

**Security:**
- AES-256-GCM encryption for API keys
- JWT authentication
- Google OAuth integration
- Rate limiting on CoinDCX API calls

### Documentation References

- **Technical Deep Dive**: `TECHNICAL_DOCUMENTATION.md`
- **System Architecture**: `SYSTEM_ARCHITECTURE.md`
- **Backend Guide**: `BACKEND_GUIDE.md`
- **Frontend Guide**: `FRONTEND_GUIDE.md`
- **API Reference**: See TECHNICAL_DOCUMENTATION.md
