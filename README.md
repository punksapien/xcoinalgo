# Multi-Tenant Trading Strategy Execution Platform

A scalable, multi-tenant platform for deploying and executing algorithmic trading strategies. Multiple users can subscribe to strategies with personalized risk parameters, while strategies execute once per candle and distribute signals to all subscribers.

---

## 🎯 Key Features

- **Multi-Tenant Architecture**: One strategy execution shared by many subscribers
- **Real-Time Execution**: Cron-based scheduling at candle boundaries (1m, 5m, 15m, etc.)
- **Distributed Coordination**: Redis-based locking for multi-worker deployments
- **Personalized Risk Management**: Each subscriber configures capital, leverage, risk per trade
- **Python Strategy Support**: Write strategies in Python with pandas, numpy, TA-Lib
- **Modern Stack**: Next.js 14, TypeScript, Prisma, Redis, Express
- **Type-Safe**: Full TypeScript coverage across frontend and backend

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                     │
│  - Strategy browsing and subscription                        │
│  - Real-time subscription management                         │
│  - Performance monitoring dashboard                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────────┐
│                 API Server (Express + TypeScript)            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Strategy Upload API  │  Strategy Execution API        │ │
│  │  - CRUD operations    │  - Subscribe/pause/cancel      │ │
│  │  - Version control    │  - Performance tracking        │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────┬──────────────────────┬──────────────────────┘
                │                      │
       ┌────────▼────────┐    ┌───────▼────────┐
       │   Database      │    │     Redis      │
       │   (Prisma)      │    │  (ioredis)     │
       │  - Strategies   │    │  - Settings    │
       │  - Subscriptions│    │  - Registry    │
       │  - Executions   │    │  - Locks       │
       │  - Trades       │    │  - Cache       │
       └─────────────────┘    └────────┬───────┘
                                       │
┌──────────────────────────────────────▼──────────────────────┐
│         Strategy Scheduler (Node-Cron Background Worker)     │
│  - Monitors active candles (symbol:resolution pairs)         │
│  - Triggers executions at candle close boundaries            │
│  - Refreshes registry every 5 minutes                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│         Execution Coordinator (TypeScript Orchestrator)      │
│  1. Acquires distributed lock (Redis NX/EX)                  │
│  2. Fetches strategy settings from Redis cache               │
│  3. Fetches active subscriptions from database               │
│  4. Spawns Python subprocess for strategy execution          │
│  5. Processes signals and creates trades for subscribers     │
│  6. Updates metrics and releases lock                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│         Python Strategy Executor (Subprocess)                │
│  - Executes user-provided Python strategy code               │
│  - Returns signals: BUY, SELL, HOLD                          │
│  - Sandboxed execution environment                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+
- **Python** 3.8+
- **Redis** 6.0+
- **npm** or **yarn**

### Installation

```bash
# Clone repository
git clone <repository-url>
cd coindcx-trading-platform

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install Python dependencies
cd ../backend
pip3 install pandas numpy requests python-dotenv
```

### Environment Setup

**Backend (.env):**
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-key-change-in-production"
REDIS_HOST="localhost"
REDIS_PORT=6379
PORT=3001
NODE_ENV="development"
```

**Frontend (.env.local):**
```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### Database Setup

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
```

### Running the Application

**Terminal 1: Redis**
```bash
redis-server
```

**Terminal 2: Backend API**
```bash
cd backend
npm run dev
```

**Terminal 3: Strategy Scheduler**
```bash
cd backend
npm run worker
```

**Terminal 4: Frontend**
```bash
cd frontend
npm run dev
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

---

## 📚 Documentation

### **Start Here**

1. **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)**
   - High-level system design
   - Multi-tenant architecture (Pattern A vs Pattern B)
   - Design patterns (Singleton, Repository, Strategy, etc.)
   - Technology stack decisions
   - Execution flow diagrams

2. **[BACKEND_GUIDE.md](./BACKEND_GUIDE.md)**
   - Project structure and organization
   - Core services (Registry, Settings, Subscriptions, Coordinator)
   - API endpoints and routing
   - Database schema and Prisma ORM
   - Redis integration patterns
   - Background workers and cron scheduling
   - Error handling and testing

3. **[FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)**
   - Next.js App Router architecture
   - React patterns and custom hooks
   - State management with Zustand
   - API integration layer
   - Component architecture
   - Styling with Tailwind CSS
   - Type safety with TypeScript

4. **[DEPLOYMENT.md](./DEPLOYMENT.md)**
   - Development setup
   - Environment configuration
   - Production deployment (PM2, Docker)
   - Monitoring and logging
   - Troubleshooting guide
   - Performance optimization

### Documentation Reading Path

**For Understanding the System:**
```
SYSTEM_ARCHITECTURE.md → BACKEND_GUIDE.md → FRONTEND_GUIDE.md
```

**For Deploying:**
```
DEPLOYMENT.md → SYSTEM_ARCHITECTURE.md (for troubleshooting)
```

**For Learning Software Development:**
```
All four documents, in order, from top to bottom
```

---

## 🏗️ Project Structure

```
coindcx-trading-platform/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma              # Database schema
│   │   └── migrations/                # Database migrations
│   ├── routes/
│   │   ├── auth.ts                    # Authentication endpoints
│   │   ├── strategy-upload.ts         # Strategy CRUD
│   │   └── strategy-execution.ts      # Subscription management
│   ├── services/
│   │   └── strategy-execution/
│   │       ├── strategy-registry.ts   # Active candles tracking
│   │       ├── settings-service.ts    # Redis settings cache
│   │       ├── subscription-service.ts# Subscription management
│   │       └── execution-coordinator.ts# Orchestration
│   ├── workers/
│   │   └── strategy-scheduler.ts      # Cron scheduler
│   ├── lib/
│   │   ├── time-utils.ts              # Time/cron utilities
│   │   └── auth.ts                    # JWT middleware
│   └── server.ts                      # Express app
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/
│   │   │   │   ├── strategies/        # Strategy listing
│   │   │   │   ├── strategy/[id]/     # Strategy detail
│   │   │   │   ├── subscriptions/     # User subscriptions
│   │   │   │   └── subscription/[id]/ # Subscription detail
│   │   │   ├── login/                 # Login page
│   │   │   └── register/              # Registration
│   │   ├── components/
│   │   │   ├── layout/                # Layout components
│   │   │   ├── strategy/              # Strategy components
│   │   │   └── ui/                    # Shadcn/ui components
│   │   └── lib/
│   │       ├── api/                   # API clients
│   │       ├── auth.ts                # Auth state (Zustand)
│   │       └── theme.ts               # Theme state (Zustand)
│   └── package.json
├── SYSTEM_ARCHITECTURE.md             # System design guide
├── BACKEND_GUIDE.md                   # Backend implementation
├── FRONTEND_GUIDE.md                  # Frontend implementation
├── DEPLOYMENT.md                      # Deployment guide
└── README.md                          # This file
```

---

## 🔑 Key Concepts

### Multi-Tenant Architecture (Pattern A)

**Traditional Approach (Pattern B):**
- Each user gets their own bot instance
- 1000 users = 1000 separate executions per candle
- Higher resource usage, more complexity

**Our Approach (Pattern A):**
- Strategy executes once per candle
- Signals distributed to all active subscribers
- 1000 users = 1 execution per candle
- Efficient, scalable, easier to monitor

### Execution Flow

```
1. Cron triggers at candle close (e.g., 15:05:00 for 5m candle)
2. Scheduler calls Execution Coordinator
3. Coordinator acquires distributed lock (Redis)
4. Fetches strategy settings from Redis cache
5. Fetches active subscriptions from database
6. Spawns Python subprocess to execute strategy
7. Python returns signal (BUY, SELL, HOLD)
8. For each subscriber:
   - Calculate position size based on risk params
   - Create trade record
   - Send order to broker (future: real API)
9. Update execution history
10. Release lock
```

### Distributed Locking

Multiple scheduler workers can run simultaneously. Redis locks ensure only one worker executes each strategy per candle:

```typescript
// Acquire lock with 60s TTL
const lockKey = `execution:sma_crossover:BTCUSDT:5:2024-01-15T15:00:00`;
const acquired = await redis.set(lockKey, workerId, 'NX', 'EX', 60);

if (acquired === 'OK') {
  // This worker got the lock, proceed with execution
  try {
    await executeStrategy();
  } finally {
    await redis.del(lockKey); // Always release lock
  }
}
```

---

## 🛠️ Tech Stack

### Backend
- **Node.js** + **TypeScript** - Type-safe server-side JavaScript
- **Express.js** - Minimal web framework
- **Prisma** - Type-safe ORM with migrations
- **Redis (ioredis)** - Caching and distributed locking
- **Node-Cron** - Scheduling at candle boundaries
- **Python** (subprocess) - Strategy execution runtime
- **JWT** - Authentication
- **Bcrypt** - Password hashing

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **Shadcn/ui** - Component library
- **Zustand** - State management
- **Lucide React** - Icons

### Database & Cache
- **SQLite** (development) / **PostgreSQL** (production)
- **Redis** - Settings cache, registry, locks

---

## 📖 Core Services

### Strategy Registry
Tracks which strategies need execution for which candles:
```typescript
await strategyRegistry.registerStrategy('sma_crossover', 'BTCUSDT', '5');
const strategies = await strategyRegistry.getStrategiesForCandle('BTCUSDT', '5');
```

### Settings Service
Fast access to strategy settings via Redis cache:
```typescript
const settings = await settingsService.getStrategySettings('strategy-id');
// Returns: { strategyCode, executionConfig }
```

### Subscription Service
Manage user subscriptions:
```typescript
await subscriptionService.subscribeUser(userId, strategyId, {
  capital: 10000,
  riskPerTrade: 0.02,
  leverage: 10,
  brokerCredentialId: 'broker-id'
});
```

### Execution Coordinator
Orchestrates the entire execution workflow with distributed locking, signal processing, and trade creation.

---

## 🔐 Authentication

JWT-based authentication with bcrypt password hashing:

```typescript
// Register
POST /auth/register
{ "email": "user@example.com", "password": "securepassword" }

// Login
POST /auth/login
{ "email": "user@example.com", "password": "securepassword" }

// Returns: { user: {...}, token: "jwt-token" }

// Use token in headers
Authorization: Bearer <token>
```

---

## 📊 API Endpoints

### Strategy Upload
- `GET /api/strategy-upload/strategies` - List strategies
- `GET /api/strategy-upload/strategies/:id` - Get strategy
- `POST /api/strategy-upload/strategies` - Create strategy (auth)
- `PUT /api/strategy-upload/strategies/:id` - Update strategy (auth)
- `DELETE /api/strategy-upload/strategies/:id` - Delete strategy (auth)

### Strategy Execution
- `POST /api/strategies/:strategyId/subscribe` - Subscribe to strategy (auth)
- `GET /api/strategies/subscriptions` - Get user subscriptions (auth)
- `GET /api/strategies/subscriptions/:id/stats` - Get subscription stats (auth)
- `POST /api/strategies/subscriptions/:id/pause` - Pause subscription (auth)
- `POST /api/strategies/subscriptions/:id/resume` - Resume subscription (auth)
- `DELETE /api/strategies/subscriptions/:id` - Cancel subscription (auth)

---

## 🧪 Example Strategy

```python
# backend/strategies/sma_crossover.py
import pandas as pd

def main(data):
    """
    Simple Moving Average Crossover Strategy

    Args:
        data: DataFrame with OHLCV data

    Returns:
        dict with action (BUY, SELL, HOLD)
    """
    # Calculate SMAs
    data['SMA_20'] = data['close'].rolling(window=20).mean()
    data['SMA_50'] = data['close'].rolling(window=50).mean()

    # Get latest values
    current_sma20 = data['SMA_20'].iloc[-1]
    current_sma50 = data['SMA_50'].iloc[-1]
    prev_sma20 = data['SMA_20'].iloc[-2]
    prev_sma50 = data['SMA_50'].iloc[-2]

    # Crossover logic
    if prev_sma20 <= prev_sma50 and current_sma20 > current_sma50:
        return {
            "action": "BUY",
            "symbol": data['symbol'].iloc[-1],
            "entryPrice": data['close'].iloc[-1],
            "stopLoss": data['close'].iloc[-1] * 0.98,
            "takeProfit": data['close'].iloc[-1] * 1.04
        }
    elif prev_sma20 >= prev_sma50 and current_sma20 < current_sma50:
        return {
            "action": "SELL",
            "symbol": data['symbol'].iloc[-1],
            "entryPrice": data['close'].iloc[-1],
            "stopLoss": data['close'].iloc[-1] * 1.02,
            "takeProfit": data['close'].iloc[-1] * 0.96
        }

    return {"action": "HOLD"}
```

---

## 🎨 Frontend Features

- **Strategy Browsing** - Search, filter, and view strategies
- **Subscription Management** - Subscribe with custom risk parameters
- **Real-Time Updates** - See subscription status and performance
- **Dark Mode** - Toggle between light and dark themes
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Type-Safe** - Full TypeScript coverage with autocomplete

---

## 🚢 Production Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Using Docker
```bash
docker-compose up -d
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

---

## 🐛 Troubleshooting

**Redis connection failed:**
```bash
redis-cli ping  # Should return PONG
redis-server    # Start if not running
```

**Database locked (SQLite):**
- Use PostgreSQL in production for concurrent writes

**Port already in use:**
```bash
lsof -i :3001   # Find process
kill -9 <PID>   # Kill process
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for more troubleshooting.

---

## 📈 Roadmap

### Phase 1: Core Platform ✅
- [x] Multi-tenant architecture
- [x] Strategy upload and management
- [x] Subscription system with risk parameters
- [x] Distributed execution coordination
- [x] Cron-based scheduling
- [x] Redis caching and locking
- [x] Frontend integration

### Phase 2: Production Ready (In Progress)
- [ ] Real broker API integration (CoinDCX, Binance)
- [ ] Backtest engine
- [ ] Performance analytics dashboard
- [ ] Trade history and P&L tracking
- [ ] Email notifications
- [ ] Webhook support

### Phase 3: Advanced Features
- [ ] Strategy marketplace
- [ ] Paper trading mode
- [ ] Multi-exchange support
- [ ] Portfolio management
- [ ] Risk analytics
- [ ] Social trading features

---

## 🤝 Contributing

This is a learning project. Feel free to:
1. Study the code and documentation
2. Build your own trading platform based on this architecture
3. Experiment with different strategies
4. Improve the documentation

---

## 📄 License

MIT License - See LICENSE file for details

---

## 📞 Support

For questions about the architecture or implementation:
1. Read the documentation guides in order
2. Check the troubleshooting section in DEPLOYMENT.md
3. Review the code comments in key files

---

## 🎓 Learning Resources

This project demonstrates:
- **Multi-tenant SaaS architecture**
- **Distributed systems** (locking, coordination)
- **Background job processing** (cron, workers)
- **API design** (REST, authentication)
- **Database design** (Prisma, migrations)
- **Caching strategies** (Redis)
- **Frontend architecture** (Next.js, React)
- **State management** (Zustand)
- **Type safety** (TypeScript)

Read all four documentation files from top to bottom to learn how to build production-grade software.

---

**Built with ❤️ for learning and experimentation**
