# Multi-Tenant Strategy Execution System - Architecture Guide

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Design Patterns](#design-patterns)
4. [Data Models](#data-models)
5. [Execution Flow](#execution-flow)
6. [Technology Stack](#technology-stack)
7. [Design Decisions](#design-decisions)

---

## Overview

This system is a **multi-tenant trading strategy execution platform** that allows multiple users to subscribe to and execute trading strategies with their own personalized risk parameters. The key innovation is that strategies execute once per candle boundary and distribute signals to all active subscribers.

### Core Concept: Pattern A vs Pattern B

**Pattern A** (What we built):
- One strategy execution → Many subscribers receive signals
- Strategies run on schedule (candle boundaries)
- Central coordination via Redis
- Efficient: 1000 subscribers = 1 execution per candle

**Pattern B** (Traditional approach):
- Each user gets their own bot instance
- 1000 subscribers = 1000 separate executions
- Higher resource usage but more isolation

We chose Pattern A for efficiency and scalability.

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                   │
│  - Strategy browsing and subscription                        │
│  - Real-time subscription management                         │
│  - Performance monitoring                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    API Server (Express.js)                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Strategy Upload API  │  Strategy Execution API        │ │
│  │  - CRUD operations    │  - Subscribe/pause/cancel      │ │
│  │  - Version control    │  - Update settings             │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────┬──────────────────────┬──────────────────────┘
                │                      │
       ┌────────▼────────┐    ┌───────▼────────┐
       │   Database      │    │     Redis      │
       │   (Prisma)      │    │  (ioredis)     │
       │                 │    │                │
       │  - Strategies   │    │  - Settings    │
       │  - Subscriptions│    │  - Registry    │
       │  - Executions   │    │  - Locks       │
       │  - Trades       │    │  - State       │
       └─────────────────┘    └────────┬───────┘
                                       │
┌──────────────────────────────────────▼──────────────────────┐
│              Strategy Scheduler Worker (Node-Cron)           │
│  - Monitors active candles                                   │
│  - Triggers executions at candle boundaries                  │
│  - Refreshes registry every 5 minutes                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│            Execution Coordinator (Orchestrator)              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  1. Acquires distributed lock (Redis NX/EX)            │ │
│  │  2. Fetches strategy settings from Redis               │ │
│  │  3. Fetches active subscriptions from DB               │ │
│  │  4. Spawns Python subprocess for strategy execution    │ │
│  │  5. Processes signals and creates trades               │ │
│  │  6. Releases lock                                      │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│           Python Strategy Execution (Subprocess)             │
│  - Executes user-provided strategy code                     │
│  - Returns signals (BUY/SELL/HOLD) via JSON                 │
│  - Sandboxed execution environment                          │
└──────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Frontend (Next.js)**
- User interface for strategy management
- Subscription configuration and monitoring
- Real-time updates via REST API polling
- Authentication and authorization

**API Server (Express.js)**
- RESTful API endpoints
- Request validation and authentication
- Business logic coordination
- Database and Redis interaction

**Redis (ioredis)**
- Strategy settings cache (fast reads)
- Strategy registry (active candles tracking)
- Distributed locking for execution coordination
- Temporary state storage

**Database (Prisma + SQLite)**
- Persistent storage for:
  - Strategies (code, config, metadata)
  - Subscriptions (user settings, status)
  - Executions (history, logs)
  - Trades (entry, exit, P&L)

**Strategy Scheduler (Node-Cron)**
- Background worker process
- Schedules strategy executions at candle boundaries
- Monitors active candles and refreshes registry
- Ensures timely execution triggers

**Execution Coordinator**
- Orchestrates strategy execution workflow
- Manages distributed locking
- Spawns Python subprocesses
- Processes signals and creates trades

**Python Executor**
- Runs user-provided strategy code
- Isolated execution environment
- Returns structured signals (JSON)

---

## Design Patterns

### 1. Singleton Pattern

Used for core services to ensure single instance across application:

```typescript
class StrategyRegistry {
  private static instance: StrategyRegistry;

  private constructor() {
    // Private constructor prevents direct instantiation
  }

  public static getInstance(): StrategyRegistry {
    if (!StrategyRegistry.instance) {
      StrategyRegistry.instance = new StrategyRegistry();
    }
    return StrategyRegistry.instance;
  }
}
```

**Why?** Ensures consistent state and prevents multiple instances accessing Redis/DB simultaneously.

**Services using this pattern:**
- `StrategyRegistry`
- `SettingsService`
- `SubscriptionService`
- `ExecutionCoordinator`

### 2. Repository Pattern

Abstract data access logic from business logic:

```typescript
// Bad: Direct Prisma calls everywhere
const subscription = await prisma.strategySubscription.findFirst({...});

// Good: Repository abstracts data access
class SubscriptionService {
  async getActiveSubscriptionsForStrategy(strategyId: string) {
    return await prisma.strategySubscription.findMany({
      where: { strategyId, isActive: true, isPaused: false }
    });
  }
}
```

**Why?** Easier to test, swap databases, and maintain consistent queries.

### 3. Strategy Pattern

Different execution strategies can be plugged in:

```typescript
interface ExecutionStrategy {
  execute(strategyCode: string, config: any): Promise<Signal>;
}

class PythonExecutionStrategy implements ExecutionStrategy {
  async execute(strategyCode: string, config: any): Promise<Signal> {
    // Python subprocess execution
  }
}

class NodeExecutionStrategy implements ExecutionStrategy {
  async execute(strategyCode: string, config: any): Promise<Signal> {
    // Node.js VM execution
  }
}
```

**Why?** Allows flexibility to support multiple strategy languages (Python, JavaScript, etc.).

### 4. Observer Pattern (via Polling)

Frontend observes backend state changes:

```typescript
// Frontend polls for updates
setInterval(() => {
  fetchSubscriptions();
}, 5000);
```

**Note:** For production, consider WebSocket/SSE for real-time updates instead of polling.

### 5. Distributed Lock Pattern

Prevents race conditions in multi-instance deployments:

```typescript
async acquireLock(lockKey: string, ttl: number): Promise<boolean> {
  // Redis SET NX (set if not exists) EX (expiration)
  const result = await redis.set(lockKey, workerId, 'NX', 'EX', ttl);
  return result === 'OK';
}
```

**Why?** In distributed systems, multiple workers might try to execute the same strategy. Locks ensure only one succeeds.

### 6. Cache-Aside Pattern

Redis as cache with database as source of truth:

```typescript
async getStrategySettings(strategyId: string) {
  // Try cache first
  const cached = await redis.get(`strategy:${strategyId}:settings`);
  if (cached) return JSON.parse(cached);

  // Cache miss: fetch from DB
  const settings = await db.strategy.findUnique({...});

  // Update cache
  await redis.set(`strategy:${strategyId}:settings`, JSON.stringify(settings));

  return settings;
}
```

**Why?** Reduces database load and improves read performance.

---

## Data Models

### Strategy

The template/blueprint for a trading algorithm.

```prisma
model Strategy {
  id              String   @id @default(uuid())
  name            String
  code            String   // Unique identifier (e.g., "sma_crossover")
  description     String?
  author          String
  version         String
  strategyCode    String   // Actual Python code
  executionConfig Json     // { symbol, resolution, lookbackPeriod }
  isActive        Boolean  @default(true)
  isPublic        Boolean  @default(false)
  isMarketplace   Boolean  @default(false)
  subscriberCount Int      @default(0)
  tags            String?  // Comma-separated tags
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Key Fields:**
- `code`: Unique human-readable identifier
- `strategyCode`: The actual Python code to execute
- `executionConfig`: JSON with symbol, resolution, etc.
- `subscriberCount`: Cached count for performance

### StrategySubscription

A user's personalized instance of a strategy.

```prisma
model StrategySubscription {
  id                String   @id @default(uuid())
  userId            String
  strategyId        String
  capital           Float
  riskPerTrade      Float    // Decimal (e.g., 0.02 = 2%)
  leverage          Int      @default(10)
  maxPositions      Int      @default(1)
  maxDailyLoss      Float    @default(0.05)
  slAtrMultiplier   Float?
  tpAtrMultiplier   Float?
  brokerCredentialId String
  isActive          Boolean  @default(true)
  isPaused          Boolean  @default(false)
  subscribedAt      DateTime @default(now())
  pausedAt          DateTime?
  unsubscribedAt    DateTime?
  totalTrades       Int      @default(0)
  winningTrades     Int      @default(0)
  losingTrades      Int      @default(0)
  totalPnl          Float    @default(0)
}
```

**Key Concepts:**
- Each user can have different risk parameters for the same strategy
- `isActive`: Whether subscription is still valid
- `isPaused`: Temporarily paused (can be resumed)
- Performance metrics cached for quick access

### StrategyExecution

Historical record of each strategy execution.

```prisma
model StrategyExecution {
  id             String   @id @default(uuid())
  strategyId     String
  scheduledTime  DateTime
  startedAt      DateTime @default(now())
  completedAt    DateTime?
  status         String   // RUNNING, COMPLETED, FAILED
  signal         String?  // BUY, SELL, HOLD
  subscribersCount Int
  tradesCreated  Int      @default(0)
  errorMessage   String?
  executionLog   String?
}
```

**Purpose:** Audit trail and debugging.

### Trade

Individual trade per subscriber.

```prisma
model Trade {
  id             String   @id @default(uuid())
  subscriptionId String
  executionId    String
  symbol         String
  side           String   // BUY, SELL
  quantity       Float
  entryPrice     Float
  exitPrice      Float?
  status         String   // OPEN, CLOSED
  pnl            Float    @default(0)
  createdAt      DateTime @default(now())
  closedAt       DateTime?
}
```

---

## Execution Flow

### End-to-End Execution Flow

```
1. Strategy Scheduler (Cron)
   ↓
   Time: 15:00:00 (5-minute candle closes)
   ↓

2. Scheduler calls Execution Coordinator
   coordinator.executeCandleStrategies('BTCUSDT', 5, timestamp)
   ↓

3. Execution Coordinator acquires lock
   lockKey = "execution:sma_crossover:BTCUSDT:5:2024-01-15T15:00:00"
   ↓
   IF lock acquired:
   ↓

4. Fetch strategy settings from Redis
   settings = redis.get('strategy:sma_crossover:settings')
   ↓

5. Fetch active subscriptions from Database
   subscriptions = db.strategySubscription.findMany({
     strategyId: 'sma_crossover',
     isActive: true,
     isPaused: false
   })
   ↓

6. Spawn Python subprocess
   python strategy_executor.py --code="sma_crossover" --symbol="BTCUSDT" --resolution=5
   ↓
   Python executes strategy code
   ↓
   Returns: { signal: "BUY", confidence: 0.85 }
   ↓

7. Process signal for each subscription
   FOR EACH subscription:
     - Calculate position size based on risk parameters
     - Create Trade record in database
     - Send order to broker API (future implementation)
     - Update subscription metrics
   ↓

8. Create StrategyExecution record
   Save execution history and logs
   ↓

9. Release lock
   redis.del(lockKey)
   ↓

10. Done
```

### Detailed Execution Coordinator Flow

```typescript
async executeCandleStrategies(symbol: string, resolution: string, scheduledTime: Date) {
  // Step 1: Get all strategies for this candle
  const strategiesForCandle = await strategyRegistry.getStrategiesForCandle(symbol, resolution);

  // Step 2: Execute each strategy
  for (const strategyId of strategiesForCandle) {
    // Step 3: Acquire distributed lock
    const lockKey = `execution:${strategyId}:${symbol}:${resolution}:${scheduledTime.toISOString()}`;
    const lockAcquired = await this.acquireLock(lockKey, 60); // 60 second TTL

    if (!lockAcquired) {
      console.log('Another worker is executing this strategy, skipping');
      continue;
    }

    try {
      // Step 4: Fetch strategy settings
      const settings = await settingsService.getStrategySettings(strategyId);

      // Step 5: Fetch active subscriptions
      const subscriptions = await subscriptionService.getActiveSubscriptionsForStrategy(strategyId);

      if (subscriptions.length === 0) {
        console.log('No active subscriptions, skipping');
        continue;
      }

      // Step 6: Create execution record
      const execution = await prisma.strategyExecution.create({
        data: {
          strategyId,
          scheduledTime,
          status: 'RUNNING',
          subscribersCount: subscriptions.length
        }
      });

      // Step 7: Execute strategy
      const signal = await this.executeStrategy(settings.strategyCode, settings.executionConfig);

      // Step 8: Process signal for each subscription
      let tradesCreated = 0;
      for (const subscription of subscriptions) {
        if (signal.action !== 'HOLD') {
          const trade = await this.createTrade(subscription, signal, execution.id);
          tradesCreated++;
        }
      }

      // Step 9: Update execution record
      await prisma.strategyExecution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          signal: signal.action,
          tradesCreated,
          completedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Execution failed:', error);
      // Log error in execution record
    } finally {
      // Step 10: Always release lock
      await this.releaseLock(lockKey);
    }
  }
}
```

---

## Technology Stack

### Backend

**Node.js + TypeScript**
- **Why?** Type safety, excellent async support, large ecosystem
- **Alternatives considered:** Python (slower for I/O), Go (steeper learning curve)

**Express.js**
- **Why?** Minimal, flexible, widely adopted
- **Alternatives:** Fastify (faster but less ecosystem), NestJS (too opinionated)

**Prisma ORM**
- **Why?** Type-safe queries, excellent DX, automatic migrations
- **Alternatives:** TypeORM (more complex), raw SQL (no type safety)

**Redis (ioredis)**
- **Why?** Fast in-memory cache, atomic operations, distributed locking
- **Alternatives:** Memcached (less features), Hazelcast (too heavy)

**Node-Cron**
- **Why?** Simple, reliable scheduling
- **Alternatives:** Bull (too complex for our use case), system cron (less flexible)

**Python (subprocess)**
- **Why?** Users already write strategies in Python, vast ML/TA libraries
- **Keep isolated:** Subprocess execution prevents memory leaks and crashes

### Frontend

**Next.js 14 (App Router)**
- **Why?** React framework with SSR, excellent performance, great DX
- **Alternatives:** Vite + React (no SSR), Remix (less mature)

**TypeScript**
- **Why?** Type safety prevents bugs, better IDE support
- **Not optional** for production applications

**Tailwind CSS**
- **Why?** Utility-first, fast development, consistent design
- **Alternatives:** CSS modules (more boilerplate), styled-components (runtime cost)

**Shadcn/ui**
- **Why?** High-quality components, fully customizable, no runtime dependency
- **Alternatives:** Material-UI (heavier), Chakra UI (more opinionated)

**Zustand**
- **Why?** Simple state management, minimal boilerplate
- **Alternatives:** Redux (too verbose), Context API (performance issues)

---

## Design Decisions

### 1. Why Multi-Tenant (Pattern A)?

**Decision:** One strategy execution shared by multiple subscribers

**Reasoning:**
- **Efficiency:** 1 execution instead of N executions
- **Cost:** Lower compute and API costs
- **Simplicity:** Easier to monitor and debug
- **Scalability:** Can handle thousands of subscribers

**Trade-offs:**
- Less isolation between users
- All subscribers get same signal (no personalization in strategy logic)
- More complex subscription management

### 2. Why Redis + Database?

**Decision:** Use both Redis (cache) and Database (persistence)

**Reasoning:**
- **Redis:** Fast reads for settings (strategies execute frequently)
- **Database:** Source of truth, historical data, complex queries
- **Best of both worlds:** Performance + Persistence

**Pattern:**
- Write-through: Updates go to both Redis and DB
- Read-through: Read from Redis, fallback to DB

### 3. Why Distributed Locking?

**Decision:** Use Redis locks to coordinate execution

**Reasoning:**
- **Multi-instance deployment:** Multiple scheduler workers can run
- **Race conditions:** Without locks, same strategy might execute twice
- **Reliability:** Lock expiration (TTL) prevents deadlocks

**Implementation:**
```typescript
// Redis SET NX (set if not exists) EX (expiration)
const result = await redis.set(lockKey, workerId, 'NX', 'EX', 60);
if (result === 'OK') {
  // Lock acquired, proceed with execution
}
```

### 4. Why Python Subprocess?

**Decision:** Execute strategies in Python subprocess instead of Node.js VM

**Reasoning:**
- **User familiarity:** Most traders already know Python
- **Libraries:** pandas, numpy, TA-Lib, etc.
- **Isolation:** Subprocess crash doesn't crash main application
- **Security:** Easier to sandbox (future: Docker containers)

**Trade-offs:**
- IPC overhead (spawn subprocess, parse JSON)
- Harder to share state between Node and Python

### 5. Why Cron-based Scheduling?

**Decision:** Use node-cron to schedule executions at candle boundaries

**Reasoning:**
- **Predictable:** Candles close at fixed intervals (1m, 5m, 15m, etc.)
- **Simple:** Cron expressions are well-understood
- **Reliable:** Built-in retry and error handling

**Alternative considered:** Event-driven (WebSocket from exchange)
- **Rejected:** More complex, harder to test, dependency on exchange uptime

### 6. Why Separate Strategy Upload API?

**Decision:** Keep strategy CRUD separate from execution API

**Reasoning:**
- **Separation of concerns:** Upload is admin-heavy, execution is performance-critical
- **Different rate limits:** Uploads are rare, executions are frequent
- **Easier to scale:** Can scale execution API independently

### 7. Why Subscriber Count Cache?

**Decision:** Cache `subscriberCount` in Strategy model

**Reasoning:**
- **Performance:** Avoid COUNT(*) query on every strategy list
- **Acceptable staleness:** Count doesn't need to be real-time
- **Update strategy:** Increment on subscribe, decrement on unsubscribe

```typescript
// When user subscribes
await prisma.strategy.update({
  where: { id: strategyId },
  data: { subscriberCount: { increment: 1 } }
});
```

---

## Key Takeaways

1. **Singleton pattern** ensures consistent service instances
2. **Repository pattern** abstracts data access
3. **Distributed locks** prevent race conditions in multi-instance deployments
4. **Cache-aside pattern** (Redis + DB) balances performance and persistence
5. **Subprocess isolation** protects main application from strategy crashes
6. **Cron-based scheduling** provides reliable, predictable execution
7. **Multi-tenant architecture** (Pattern A) maximizes efficiency and scalability

---

## Next Steps

To fully understand this system:
1. Read `BACKEND_GUIDE.md` for detailed backend implementation
2. Read `FRONTEND_GUIDE.md` for detailed frontend implementation
3. Study `backend/services/strategy-execution/` directory for core execution logic
4. Review `frontend/src/lib/api/strategy-execution-api.ts` for API integration
5. Examine database schema in `backend/prisma/schema.prisma`

