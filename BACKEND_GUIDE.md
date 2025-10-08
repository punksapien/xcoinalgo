# Backend Implementation Guide

## Table of Contents
1. [Project Structure](#project-structure)
2. [Core Services](#core-services)
3. [API Endpoints](#api-endpoints)
4. [Database Layer](#database-layer)
5. [Redis Integration](#redis-integration)
6. [Background Workers](#background-workers)
7. [Error Handling](#error-handling)
8. [Testing Strategies](#testing-strategies)

---

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma           # Database schema definition
│   └── migrations/             # Database migrations
├── routes/
│   ├── auth.ts                 # Authentication routes
│   ├── strategy-upload.ts      # Strategy CRUD routes
│   └── strategy-execution.ts   # Subscription & execution routes
├── services/
│   ├── strategy-execution/
│   │   ├── strategy-registry.ts      # Active candles tracking
│   │   ├── settings-service.ts       # Redis settings cache
│   │   ├── subscription-service.ts   # Subscription management
│   │   └── execution-coordinator.ts  # Orchestrates execution
│   └── redis.ts                # Redis client setup
├── workers/
│   └── strategy-scheduler.ts   # Cron-based execution scheduler
├── lib/
│   ├── time-utils.ts           # Time/cron utilities
│   └── auth.ts                 # JWT authentication
└── server.ts                   # Express app entry point
```

### Why This Structure?

**Separation by Layer:**
- `routes/`: HTTP interface (thin layer)
- `services/`: Business logic (thick layer)
- `prisma/`: Data access (persistence)
- `workers/`: Background processes (async tasks)

**Benefits:**
1. **Testability:** Easy to test services independently
2. **Reusability:** Services can be used by multiple routes
3. **Maintainability:** Changes are isolated to specific layers

---

## Core Services

### 1. Strategy Registry

**Purpose:** Track which strategies need execution for which candles.

**File:** `backend/services/strategy-execution/strategy-registry.ts`

**Key Concepts:**

```typescript
interface CandleKey {
  symbol: string;
  resolution: string;
}

class StrategyRegistry {
  private cache: Map<string, Set<string>> = new Map();
  // cache structure: { "BTCUSDT:5": Set(["sma_crossover", "rsi_strategy"]) }

  async registerStrategy(strategyId: string, symbol: string, resolution: string) {
    const candleKey = `${symbol}:${resolution}`;

    // Add to Redis set
    await redis.sadd(`candle:${candleKey}:strategies`, strategyId);

    // Update in-memory cache
    if (!this.cache.has(candleKey)) {
      this.cache.set(candleKey, new Set());
    }
    this.cache.get(candleKey)!.add(strategyId);
  }

  async getStrategiesForCandle(symbol: string, resolution: string): Promise<string[]> {
    const candleKey = `${symbol}:${resolution}`;

    // Try cache first
    if (this.cache.has(candleKey)) {
      return Array.from(this.cache.get(candleKey)!);
    }

    // Cache miss: fetch from Redis
    const strategies = await redis.smembers(`candle:${candleKey}:strategies`);
    this.cache.set(candleKey, new Set(strategies));
    return strategies;
  }
}
```

**Design Patterns:**

1. **Singleton Pattern:**
```typescript
export const strategyRegistry = StrategyRegistry.getInstance();
```
Ensures only one instance exists across the application.

2. **Two-Level Cache:**
- Memory cache (fastest, but lost on restart)
- Redis cache (persistent, shared across workers)

**When to Use:**
- Scheduler needs to know what to execute
- Strategy upload/deletion needs to update registry

### 2. Settings Service

**Purpose:** Fast access to strategy settings without hitting the database.

**File:** `backend/services/strategy-execution/settings-service.ts`

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
├─────────────────────────────────────────────────────────┤
│                    Settings Service                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  getStrategySettings(strategyId)                  │  │
│  │    1. Check Redis cache                           │  │
│  │    2. If miss, query Database                     │  │
│  │    3. Update Redis cache                          │  │
│  │    4. Return settings                             │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│              Redis (Cache Layer)                         │
│  Key: strategy:{strategyId}:settings                    │
│  TTL: None (invalidate on update)                       │
├─────────────────────────────────────────────────────────┤
│              Database (Source of Truth)                  │
│  Table: Strategy                                         │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
class SettingsService {
  private readonly SETTINGS_KEY_PREFIX = 'strategy';

  async getStrategySettings(strategyId: string): Promise<StrategySettings> {
    const cacheKey = `${this.SETTINGS_KEY_PREFIX}:${strategyId}:settings`;

    // 1. Try Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. Cache miss: query database
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId }
    });

    if (!strategy) {
      throw new Error('Strategy not found');
    }

    const settings: StrategySettings = {
      strategyId: strategy.id,
      strategyCode: strategy.strategyCode,
      executionConfig: strategy.executionConfig as ExecutionConfig
    };

    // 3. Update cache
    await redis.set(cacheKey, JSON.stringify(settings));

    return settings;
  }

  async updateStrategySettings(strategyId: string, updates: Partial<StrategySettings>) {
    // 1. Update database
    await prisma.strategy.update({
      where: { id: strategyId },
      data: updates
    });

    // 2. Invalidate cache (or update it)
    const cacheKey = `${this.SETTINGS_KEY_PREFIX}:${strategyId}:settings`;
    await redis.del(cacheKey);

    // Alternative: Update cache directly
    // const newSettings = await this.getStrategySettings(strategyId);
    // await redis.set(cacheKey, JSON.stringify(newSettings));
  }
}
```

**Cache Invalidation Strategies:**

1. **Delete on Update (What we use):**
```typescript
await redis.del(cacheKey);
```
Simple, avoids stale data, slight performance hit on next read.

2. **Update on Write:**
```typescript
await redis.set(cacheKey, JSON.stringify(newSettings));
```
Faster reads after update, but requires fetching new data first.

3. **TTL-based:**
```typescript
await redis.setex(cacheKey, 300, JSON.stringify(settings)); // 5 min TTL
```
Good for data that changes infrequently, but can serve stale data.

**Why We Chose Delete-on-Update:**
- Settings rarely change
- Ensures no stale data
- Simpler implementation

### 3. Subscription Service

**Purpose:** Manage user subscriptions to strategies.

**File:** `backend/services/strategy-execution/subscription-service.ts`

**Key Methods:**

```typescript
class SubscriptionService {
  // Create new subscription
  async subscribeUser(
    userId: string,
    strategyId: string,
    config: SubscriptionConfig
  ): Promise<Subscription> {
    // 1. Validate strategy exists and is active
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId }
    });

    if (!strategy || !strategy.isActive) {
      throw new Error('Strategy not found or inactive');
    }

    // 2. Check if user already subscribed
    const existing = await prisma.strategySubscription.findFirst({
      where: { userId, strategyId, isActive: true }
    });

    if (existing) {
      throw new Error('Already subscribed to this strategy');
    }

    // 3. Create subscription
    const subscription = await prisma.strategySubscription.create({
      data: {
        userId,
        strategyId,
        capital: config.capital,
        riskPerTrade: config.riskPerTrade,
        leverage: config.leverage || 10,
        maxPositions: config.maxPositions || 1,
        maxDailyLoss: config.maxDailyLoss || 0.05,
        slAtrMultiplier: config.slAtrMultiplier,
        tpAtrMultiplier: config.tpAtrMultiplier,
        brokerCredentialId: config.brokerCredentialId
      }
    });

    // 4. Increment subscriber count
    await prisma.strategy.update({
      where: { id: strategyId },
      data: { subscriberCount: { increment: 1 } }
    });

    // 5. Register strategy in registry if first subscriber
    await this.ensureStrategyRegistered(strategy);

    return subscription;
  }

  // Get active subscriptions for strategy execution
  async getActiveSubscriptionsForStrategy(strategyId: string): Promise<Subscription[]> {
    return await prisma.strategySubscription.findMany({
      where: {
        strategyId,
        isActive: true,
        isPaused: false
      },
      include: {
        brokerCredential: {
          select: {
            id: true,
            apiKey: true,
            apiSecret: true
          }
        }
      }
    });
  }

  // Pause subscription
  async pauseSubscription(subscriptionId: string, userId: string): Promise<void> {
    const subscription = await prisma.strategySubscription.findFirst({
      where: { id: subscriptionId, userId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (!subscription.isActive) {
      throw new Error('Subscription is not active');
    }

    await prisma.strategySubscription.update({
      where: { id: subscriptionId },
      data: {
        isPaused: true,
        pausedAt: new Date()
      }
    });
  }

  // Resume subscription
  async resumeSubscription(subscriptionId: string, userId: string): Promise<void> {
    const subscription = await prisma.strategySubscription.findFirst({
      where: { id: subscriptionId, userId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (!subscription.isActive) {
      throw new Error('Subscription is not active');
    }

    if (!subscription.isPaused) {
      throw new Error('Subscription is not paused');
    }

    await prisma.strategySubscription.update({
      where: { id: subscriptionId },
      data: {
        isPaused: false,
        pausedAt: null
      }
    });
  }

  // Cancel subscription (soft delete)
  async cancelSubscription(subscriptionId: string, userId: string): Promise<void> {
    const subscription = await prisma.strategySubscription.findFirst({
      where: { id: subscriptionId, userId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    await prisma.strategySubscription.update({
      where: { id: subscriptionId },
      data: {
        isActive: false,
        unsubscribedAt: new Date()
      }
    });

    // Decrement subscriber count
    await prisma.strategy.update({
      where: { id: subscription.strategyId },
      data: { subscriberCount: { decrement: 1 } }
    });
  }
}
```

**Important Patterns:**

1. **Soft Delete:**
```typescript
isActive: false,
unsubscribedAt: new Date()
```
Never actually delete subscriptions - preserves historical data.

2. **Atomic Operations:**
```typescript
await prisma.strategy.update({
  data: { subscriberCount: { increment: 1 } }
});
```
Database-level increment prevents race conditions.

3. **Ownership Validation:**
```typescript
where: { id: subscriptionId, userId }
```
Always verify user owns the resource.

### 4. Execution Coordinator

**Purpose:** Orchestrate the entire execution workflow.

**File:** `backend/services/strategy-execution/execution-coordinator.ts`

**High-Level Flow:**

```typescript
class ExecutionCoordinator {
  async executeCandleStrategies(
    symbol: string,
    resolution: string,
    scheduledTime: Date
  ): Promise<void> {
    console.log(`Executing strategies for ${symbol}:${resolution}`);

    // 1. Get all strategies registered for this candle
    const strategyIds = await strategyRegistry.getStrategiesForCandle(symbol, resolution);

    if (strategyIds.length === 0) {
      console.log('No strategies registered for this candle');
      return;
    }

    // 2. Execute each strategy
    for (const strategyId of strategyIds) {
      await this.executeStrategy(strategyId, symbol, resolution, scheduledTime);
    }
  }

  private async executeStrategy(
    strategyId: string,
    symbol: string,
    resolution: string,
    scheduledTime: Date
  ): Promise<void> {
    // Create unique lock key
    const lockKey = `execution:${strategyId}:${symbol}:${resolution}:${scheduledTime.toISOString()}`;
    const workerId = process.env.WORKER_ID || `worker-${process.pid}`;

    // Step 1: Acquire distributed lock
    const lockAcquired = await this.acquireLock(lockKey, workerId, 60);
    if (!lockAcquired) {
      console.log(`Lock already held by another worker, skipping ${strategyId}`);
      return;
    }

    try {
      // Step 2: Fetch strategy settings
      const settings = await settingsService.getStrategySettings(strategyId);

      // Step 3: Get active subscriptions
      const subscriptions = await subscriptionService.getActiveSubscriptionsForStrategy(strategyId);

      if (subscriptions.length === 0) {
        console.log(`No active subscriptions for ${strategyId}`);
        return;
      }

      console.log(`Executing ${strategyId} for ${subscriptions.length} subscribers`);

      // Step 4: Create execution record
      const execution = await prisma.strategyExecution.create({
        data: {
          strategyId,
          scheduledTime,
          status: 'RUNNING',
          subscribersCount: subscriptions.length
        }
      });

      // Step 5: Execute strategy (Python subprocess)
      const signal = await this.runStrategyCode(
        settings.strategyCode,
        settings.executionConfig
      );

      console.log(`Strategy ${strategyId} returned signal: ${signal.action}`);

      // Step 6: Process signal for each subscription
      let tradesCreated = 0;
      for (const subscription of subscriptions) {
        if (signal.action === 'HOLD') {
          continue; // No trade
        }

        // Create trade
        await this.createTrade(subscription, signal, execution.id);
        tradesCreated++;
      }

      // Step 7: Update execution record
      await prisma.strategyExecution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          signal: signal.action,
          tradesCreated,
          completedAt: new Date()
        }
      });

      console.log(`Execution complete: ${tradesCreated} trades created`);

    } catch (error) {
      console.error(`Execution failed for ${strategyId}:`, error);
      // Log error (implementation omitted for brevity)
    } finally {
      // Step 8: Always release lock
      await this.releaseLock(lockKey);
    }
  }

  // Distributed lock implementation
  private async acquireLock(
    lockKey: string,
    workerId: string,
    ttlSeconds: number
  ): Promise<boolean> {
    // Redis SET NX (set if not exists) EX (expiration)
    const result = await redis.set(lockKey, workerId, 'NX', 'EX', ttlSeconds);
    return result === 'OK';
  }

  private async releaseLock(lockKey: string): Promise<void> {
    await redis.del(lockKey);
  }

  // Execute Python strategy code
  private async runStrategyCode(
    strategyCode: string,
    executionConfig: ExecutionConfig
  ): Promise<Signal> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [
        'strategy_executor.py',
        '--code', strategyCode,
        '--symbol', executionConfig.symbol,
        '--resolution', executionConfig.resolution.toString(),
        '--lookback', executionConfig.lookbackPeriod?.toString() || '100'
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
          return;
        }

        try {
          const signal = JSON.parse(output);
          resolve(signal);
        } catch (err) {
          reject(new Error(`Failed to parse strategy output: ${output}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Strategy execution timeout'));
      }, 30000);
    });
  }

  // Create trade for subscriber
  private async createTrade(
    subscription: Subscription,
    signal: Signal,
    executionId: string
  ): Promise<void> {
    // Calculate position size based on risk parameters
    const riskAmount = subscription.capital * subscription.riskPerTrade;
    const positionSize = this.calculatePositionSize(
      riskAmount,
      signal.entryPrice,
      signal.stopLoss,
      subscription.leverage
    );

    // Create trade record
    await prisma.trade.create({
      data: {
        subscriptionId: subscription.id,
        executionId,
        symbol: signal.symbol,
        side: signal.action, // BUY or SELL
        quantity: positionSize,
        entryPrice: signal.entryPrice,
        status: 'OPEN'
      }
    });

    // Update subscription metrics
    await prisma.strategySubscription.update({
      where: { id: subscription.id },
      data: {
        totalTrades: { increment: 1 }
      }
    });

    // TODO: Send order to broker API
    // await brokerAPI.placeOrder(subscription.brokerCredentialId, {
    //   symbol: signal.symbol,
    //   side: signal.action,
    //   quantity: positionSize,
    //   type: 'MARKET'
    // });
  }

  private calculatePositionSize(
    riskAmount: number,
    entryPrice: number,
    stopLoss: number,
    leverage: number
  ): number {
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const positionSize = (riskAmount / riskPerUnit) * leverage;
    return positionSize;
  }
}
```

**Key Concepts:**

1. **Distributed Lock:**
Prevents multiple workers from executing the same strategy simultaneously.

2. **Try-Finally Pattern:**
```typescript
try {
  // Execution logic
} finally {
  await this.releaseLock(lockKey);
}
```
Always release locks, even if execution fails.

3. **Subprocess Isolation:**
Python strategy runs in separate process - crashes don't affect Node.js app.

4. **Atomic Updates:**
```typescript
totalTrades: { increment: 1 }
```
Database handles increment atomically.

---

## API Endpoints

### Authentication Routes

**File:** `backend/routes/auth.ts`

```typescript
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // 2. Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create user
    const user = await prisma.user.create({
      data: { email, password: hashedPassword }
    });

    // 5. Generate JWT
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '7d'
    });

    res.json({ user: { id: user.id, email: user.email }, token });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3. Generate JWT
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '7d'
    });

    res.json({ user: { id: user.id, email: user.email }, token });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});
```

**Security Best Practices:**

1. **Password Hashing:** Always use bcrypt (or argon2)
2. **Generic Error Messages:** Don't reveal if email exists
3. **JWT Expiration:** Set reasonable expiry (7 days)
4. **HTTPS Only:** In production, use HTTPS

### Strategy Upload Routes

**File:** `backend/routes/strategy-upload.ts`

```typescript
// Get all strategies (with filters)
router.get('/api/strategy-upload/strategies', async (req, res) => {
  try {
    const { search, status, tags } = req.query;

    // Build where clause dynamically
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { author: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    if (tags) {
      where.tags = { contains: tags as string };
    }

    const strategies = await prisma.strategy.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ strategies });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch strategies' });
  }
});

// Get single strategy
router.get('/api/strategy-upload/strategies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const strategy = await prisma.strategy.findUnique({
      where: { id }
    });

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    res.json({ strategy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch strategy' });
  }
});

// Create strategy (authenticated)
router.post('/api/strategy-upload/strategies', authenticateJWT, async (req, res) => {
  try {
    const { name, code, description, strategyCode, executionConfig, tags } = req.body;

    // Validate required fields
    if (!name || !code || !strategyCode || !executionConfig) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if code is unique
    const existing = await prisma.strategy.findFirst({
      where: { code }
    });

    if (existing) {
      return res.status(409).json({ error: 'Strategy code already exists' });
    }

    // Create strategy
    const strategy = await prisma.strategy.create({
      data: {
        name,
        code,
        description,
        author: req.user.email,
        version: '1.0.0',
        strategyCode,
        executionConfig,
        tags,
        userId: req.user.userId
      }
    });

    res.status(201).json({ strategy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create strategy' });
  }
});

// Update strategy (authenticated)
router.put('/api/strategy-upload/strategies/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verify ownership
    const strategy = await prisma.strategy.findFirst({
      where: { id, userId: req.user.userId }
    });

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    // Update strategy
    const updated = await prisma.strategy.update({
      where: { id },
      data: updates
    });

    // Invalidate cache
    await settingsService.invalidateStrategyCache(id);

    res.json({ strategy: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update strategy' });
  }
});

// Delete strategy (authenticated)
router.delete('/api/strategy-upload/strategies/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const strategy = await prisma.strategy.findFirst({
      where: { id, userId: req.user.userId }
    });

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    // Check for active subscriptions
    const subscriptions = await prisma.strategySubscription.count({
      where: { strategyId: id, isActive: true }
    });

    if (subscriptions > 0) {
      return res.status(400).json({
        error: 'Cannot delete strategy with active subscriptions'
      });
    }

    // Soft delete
    await prisma.strategy.update({
      where: { id },
      data: { isActive: false }
    });

    // Remove from registry
    await strategyRegistry.unregisterStrategy(id);

    res.json({ message: 'Strategy deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete strategy' });
  }
});
```

**API Design Patterns:**

1. **RESTful Design:**
- GET /resources - List
- GET /resources/:id - Get single
- POST /resources - Create
- PUT /resources/:id - Update
- DELETE /resources/:id - Delete

2. **Consistent Error Responses:**
```typescript
{ error: 'Error message' }
```

3. **Status Codes:**
- 200: Success
- 201: Created
- 400: Bad request
- 401: Unauthorized
- 404: Not found
- 409: Conflict
- 500: Server error

### Strategy Execution Routes

**File:** `backend/routes/strategy-execution.ts`

```typescript
// Subscribe to strategy
router.post('/api/strategies/:strategyId/subscribe', authenticateJWT, async (req, res) => {
  try {
    const { strategyId } = req.params;
    const config: SubscriptionConfig = req.body;

    // Validate config
    if (!config.capital || !config.riskPerTrade || !config.brokerCredentialId) {
      return res.status(400).json({ error: 'Missing required configuration' });
    }

    const subscription = await subscriptionService.subscribeUser(
      req.user.userId,
      strategyId,
      config
    );

    res.status(201).json({
      message: 'Successfully subscribed to strategy',
      subscription
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's subscriptions
router.get('/api/strategies/subscriptions', authenticateJWT, async (req, res) => {
  try {
    const subscriptions = await prisma.strategySubscription.findMany({
      where: { userId: req.user.userId },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
            executionConfig: true
          }
        }
      },
      orderBy: { subscribedAt: 'desc' }
    });

    res.json({ subscriptions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// Get subscription stats
router.get('/api/strategies/subscriptions/:subscriptionId/stats', authenticateJWT, async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    // Verify ownership
    const subscription = await prisma.strategySubscription.findFirst({
      where: { id: subscriptionId, userId: req.user.userId },
      include: { strategy: true }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Calculate stats
    const totalTrades = subscription.totalTrades;
    const winningTrades = subscription.winningTrades;
    const losingTrades = subscription.losingTrades;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

    const stats = {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl: subscription.totalPnl
    };

    res.json({ subscription, stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Pause subscription
router.post('/api/strategies/subscriptions/:subscriptionId/pause', authenticateJWT, async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    await subscriptionService.pauseSubscription(subscriptionId, req.user.userId);

    res.json({ message: 'Subscription paused successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resume subscription
router.post('/api/strategies/subscriptions/:subscriptionId/resume', authenticateJWT, async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    await subscriptionService.resumeSubscription(subscriptionId, req.user.userId);

    res.json({ message: 'Subscription resumed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel subscription
router.delete('/api/strategies/subscriptions/:subscriptionId', authenticateJWT, async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    await subscriptionService.cancelSubscription(subscriptionId, req.user.userId);

    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update subscription settings
router.put('/api/strategies/subscriptions/:subscriptionId', authenticateJWT, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const updates: Partial<SubscriptionConfig> = req.body;

    // Verify ownership
    const subscription = await prisma.strategySubscription.findFirst({
      where: { id: subscriptionId, userId: req.user.userId }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Update subscription
    const updated = await prisma.strategySubscription.update({
      where: { id: subscriptionId },
      data: updates
    });

    res.json({
      message: 'Subscription updated successfully',
      subscription: updated
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});
```

---

## Database Layer

### Prisma Schema

**File:** `backend/prisma/schema.prisma`

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  strategies         Strategy[]
  subscriptions      StrategySubscription[]
  brokerCredentials  BrokerCredential[]
}

model Strategy {
  id              String   @id @default(uuid())
  userId          String
  name            String
  code            String   @unique  // Human-readable identifier
  description     String?
  author          String
  version         String
  strategyCode    String   // Actual Python code
  executionConfig Json     // { symbol, resolution, lookbackPeriod }
  isActive        Boolean  @default(true)
  isPublic        Boolean  @default(false)
  isMarketplace   Boolean  @default(false)
  subscriberCount Int      @default(0)
  tags            String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user          User                   @relation(fields: [userId], references: [id])
  subscriptions StrategySubscription[]
  executions    StrategyExecution[]

  @@index([code])
  @@index([userId])
}

model StrategySubscription {
  id                 String    @id @default(uuid())
  userId             String
  strategyId         String
  capital            Float
  riskPerTrade       Float
  leverage           Int       @default(10)
  maxPositions       Int       @default(1)
  maxDailyLoss       Float     @default(0.05)
  slAtrMultiplier    Float?
  tpAtrMultiplier    Float?
  brokerCredentialId String
  isActive           Boolean   @default(true)
  isPaused           Boolean   @default(false)
  subscribedAt       DateTime  @default(now())
  pausedAt           DateTime?
  unsubscribedAt     DateTime?
  totalTrades        Int       @default(0)
  winningTrades      Int       @default(0)
  losingTrades       Int       @default(0)
  totalPnl           Float     @default(0)

  user             User             @relation(fields: [userId], references: [id])
  strategy         Strategy         @relation(fields: [strategyId], references: [id])
  brokerCredential BrokerCredential @relation(fields: [brokerCredentialId], references: [id])
  trades           Trade[]

  @@index([userId])
  @@index([strategyId])
  @@index([isActive, isPaused])
}

model StrategyExecution {
  id               String    @id @default(uuid())
  strategyId       String
  scheduledTime    DateTime
  startedAt        DateTime  @default(now())
  completedAt      DateTime?
  status           String    // RUNNING, COMPLETED, FAILED
  signal           String?   // BUY, SELL, HOLD
  subscribersCount Int
  tradesCreated    Int       @default(0)
  errorMessage     String?
  executionLog     String?

  strategy Strategy @relation(fields: [strategyId], references: [id])
  trades   Trade[]

  @@index([strategyId])
  @@index([scheduledTime])
}

model Trade {
  id             String    @id @default(uuid())
  subscriptionId String
  executionId    String
  symbol         String
  side           String    // BUY, SELL
  quantity       Float
  entryPrice     Float
  exitPrice      Float?
  status         String    // OPEN, CLOSED
  pnl            Float     @default(0)
  createdAt      DateTime  @default(now())
  closedAt       DateTime?

  subscription StrategySubscription @relation(fields: [subscriptionId], references: [id])
  execution    StrategyExecution    @relation(fields: [executionId], references: [id])

  @@index([subscriptionId])
  @@index([executionId])
  @@index([status])
}

model BrokerCredential {
  id         String   @id @default(uuid())
  userId     String
  brokerName String
  apiKey     String
  apiSecret  String
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())

  user          User                   @relation(fields: [userId], references: [id])
  subscriptions StrategySubscription[]

  @@index([userId])
}
```

**Schema Design Principles:**

1. **UUID Primary Keys:**
```prisma
id String @id @default(uuid())
```
Benefits: No sequential guessing, easier distributed systems

2. **Indexed Foreign Keys:**
```prisma
@@index([userId])
@@index([strategyId])
```
Fast lookups on related data

3. **Composite Indexes:**
```prisma
@@index([isActive, isPaused])
```
Optimizes queries filtering on multiple fields

4. **Timestamps:**
```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```
Track creation and modification

5. **Soft Deletes:**
```prisma
isActive Boolean @default(true)
unsubscribedAt DateTime?
```
Preserve historical data

### Database Migrations

**Create Migration:**
```bash
npx prisma migrate dev --name add_subscription_model
```

**Apply Migrations:**
```bash
npx prisma migrate deploy
```

**Generate Prisma Client:**
```bash
npx prisma generate
```

**Why Migrations?**
- Version control for schema changes
- Safe rollback mechanism
- Reproducible across environments

---

## Redis Integration

### Redis Setup

**File:** `backend/services/redis.ts`

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

redis.on('connect', () => {
  console.log('✓ Redis connected');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

export { redis };
```

### Redis Data Structures

**1. Strategy Settings (String):**
```typescript
// Key: strategy:{strategyId}:settings
// Value: JSON string
await redis.set('strategy:abc123:settings', JSON.stringify({
  strategyId: 'abc123',
  strategyCode: 'def sma_crossover():...',
  executionConfig: { symbol: 'BTCUSDT', resolution: '5' }
}));
```

**2. Candle Registry (Set):**
```typescript
// Key: candle:{symbol}:{resolution}:strategies
// Value: Set of strategy IDs
await redis.sadd('candle:BTCUSDT:5:strategies', 'sma_crossover');
await redis.sadd('candle:BTCUSDT:5:strategies', 'rsi_strategy');

// Get all strategies for candle
const strategies = await redis.smembers('candle:BTCUSDT:5:strategies');
// Returns: ['sma_crossover', 'rsi_strategy']
```

**3. Distributed Locks (String with TTL):**
```typescript
// Key: execution:{strategyId}:{symbol}:{resolution}:{timestamp}
// Value: Worker ID
// TTL: 60 seconds
const lockKey = 'execution:sma_crossover:BTCUSDT:5:2024-01-15T15:00:00';
const workerId = 'worker-12345';

// Acquire lock
const result = await redis.set(lockKey, workerId, 'NX', 'EX', 60);
// Returns 'OK' if lock acquired, null if already locked

// Release lock
await redis.del(lockKey);
```

**4. Active Candles List (Set):**
```typescript
// Key: active:candles
// Value: Set of candle keys
await redis.sadd('active:candles', 'BTCUSDT:5');
await redis.sadd('active:candles', 'ETHUSDT:15');

const activeCandles = await redis.smembers('active:candles');
```

### Redis Commands Cheat Sheet

```typescript
// Strings
await redis.set(key, value);
await redis.get(key);
await redis.del(key);
await redis.setex(key, ttl, value); // Set with expiration

// Sets
await redis.sadd(key, member);
await redis.smembers(key);
await redis.srem(key, member);
await redis.sismember(key, member);

// Locks
await redis.set(key, value, 'NX', 'EX', ttl);
// NX: Set if not exists
// EX: Expiration in seconds

// Expiration
await redis.expire(key, seconds);
await redis.ttl(key); // Get remaining TTL
```

---

## Background Workers

### Strategy Scheduler

**File:** `backend/workers/strategy-scheduler.ts`

```typescript
import cron from 'node-cron';
import { strategyRegistry } from '../services/strategy-execution/strategy-registry';
import { executionCoordinator } from '../services/strategy-execution/execution-coordinator';
import { resolutionToCron, computeNextCandleClose } from '../lib/time-utils';

class StrategyScheduler {
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private workerId: string;

  constructor() {
    this.workerId = process.env.WORKER_ID || `scheduler-${process.pid}`;
    console.log(`Strategy Scheduler Started - Worker ID: ${this.workerId}`);
  }

  async initialize() {
    // 1. Initialize registry
    await strategyRegistry.initialize();

    // 2. Get active candles
    const activeCandles = await strategyRegistry.getActiveCandles();
    console.log(`Found ${activeCandles.length} active candles to schedule`);

    // 3. Schedule each candle
    for (const candle of activeCandles) {
      await this.scheduleCandle(candle.symbol, candle.resolution);
    }

    // 4. Schedule periodic refresh
    this.scheduleRefresh();
  }

  async scheduleCandle(symbol: string, resolution: string) {
    const candleKey = `${symbol}:${resolution}`;

    if (this.scheduledJobs.has(candleKey)) {
      console.log(`${candleKey} already scheduled`);
      return;
    }

    // Convert resolution to cron pattern
    const cronPattern = resolutionToCron(resolution);
    console.log(`Scheduling ${candleKey} with cron: ${cronPattern}`);

    // Create cron job
    const job = cron.schedule(cronPattern, async () => {
      const scheduledTime = computeNextCandleClose(new Date(), resolution);
      console.log(`Executing ${candleKey} at ${scheduledTime.toISOString()}`);

      await executionCoordinator.executeCandleStrategies(
        symbol,
        resolution,
        scheduledTime
      );
    });

    this.scheduledJobs.set(candleKey, job);
    console.log(`✓ ${candleKey} scheduled successfully`);
  }

  scheduleRefresh() {
    // Refresh registry every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      console.log('Refreshing schedules...');

      await strategyRegistry.refreshCache();
      const activeCandles = await strategyRegistry.getActiveCandles();

      // Remove inactive schedules
      for (const [key, job] of this.scheduledJobs) {
        const [symbol, resolution] = key.split(':');
        const isActive = activeCandles.some(
          c => c.symbol === symbol && c.resolution === resolution
        );

        if (!isActive) {
          job.stop();
          this.scheduledJobs.delete(key);
          console.log(`Removed schedule: ${key}`);
        }
      }

      // Add new schedules
      for (const candle of activeCandles) {
        const key = `${candle.symbol}:${candle.resolution}`;
        if (!this.scheduledJobs.has(key)) {
          await this.scheduleCandle(candle.symbol, candle.resolution);
        }
      }

      console.log(`Refresh complete. Active schedules: ${this.scheduledJobs.size}`);
    });
  }

  async shutdown() {
    console.log('Shutting down scheduler...');

    for (const [key, job] of this.scheduledJobs) {
      job.stop();
      console.log(`Stopped job: ${key}`);
    }

    this.scheduledJobs.clear();
    console.log('Shutdown complete');
  }
}

// Create and start scheduler
const scheduler = new StrategyScheduler();
scheduler.initialize();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await scheduler.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await scheduler.shutdown();
  process.exit(0);
});
```

**Time Utilities:**

**File:** `backend/lib/time-utils.ts`

```typescript
export function resolutionToCron(resolution: string): string {
  const minutes = parseInt(resolution);

  switch (minutes) {
    case 1:
      return '* * * * *'; // Every minute
    case 5:
      return '*/5 * * * *'; // Every 5 minutes
    case 15:
      return '*/15 * * * *'; // Every 15 minutes
    case 30:
      return '*/30 * * * *'; // Every 30 minutes
    case 60:
      return '0 * * * *'; // Every hour
    case 240:
      return '0 */4 * * *'; // Every 4 hours
    case 1440:
      return '0 0 * * *'; // Daily
    default:
      throw new Error(`Unsupported resolution: ${resolution}`);
  }
}

export function computeNextCandleClose(now: Date, resolution: string): Date {
  const minutes = parseInt(resolution);
  const timestamp = now.getTime();
  const resolutionMs = minutes * 60 * 1000;

  // Round up to next candle boundary
  const nextCandle = Math.ceil(timestamp / resolutionMs) * resolutionMs;

  return new Date(nextCandle);
}
```

**Cron Pattern Examples:**

```
* * * * * - Every minute
*/5 * * * * - Every 5 minutes
0 * * * * - Every hour at minute 0
0 0 * * * - Daily at midnight
0 0 * * 0 - Weekly on Sunday at midnight
```

---

## Error Handling

### Centralized Error Handler

```typescript
// Error middleware (add at end of Express app)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(500).json({ error: message });
});
```

### Try-Catch Wrapper

```typescript
// Utility to wrap async route handlers
function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage
router.get('/api/strategies', asyncHandler(async (req, res) => {
  const strategies = await prisma.strategy.findMany();
  res.json({ strategies });
}));
```

### Custom Error Classes

```typescript
class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

// Error handler recognizes custom errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }

  if (err instanceof UnauthorizedError) {
    return res.status(401).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
});
```

---

## Testing Strategies

### Unit Testing Services

```typescript
// Example: Testing SubscriptionService
import { subscriptionService } from '../services/strategy-execution/subscription-service';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma');

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('subscribeUser creates subscription', async () => {
    const mockStrategy = { id: '123', isActive: true };
    const mockSubscription = { id: 'sub1', userId: 'user1' };

    (prisma.strategy.findUnique as jest.Mock).mockResolvedValue(mockStrategy);
    (prisma.strategySubscription.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.strategySubscription.create as jest.Mock).mockResolvedValue(mockSubscription);

    const result = await subscriptionService.subscribeUser('user1', '123', {
      capital: 10000,
      riskPerTrade: 0.02,
      brokerCredentialId: 'broker1'
    });

    expect(result).toEqual(mockSubscription);
    expect(prisma.strategySubscription.create).toHaveBeenCalled();
  });

  test('subscribeUser throws if already subscribed', async () => {
    const mockStrategy = { id: '123', isActive: true };
    const existingSubscription = { id: 'sub1' };

    (prisma.strategy.findUnique as jest.Mock).mockResolvedValue(mockStrategy);
    (prisma.strategySubscription.findFirst as jest.Mock).mockResolvedValue(existingSubscription);

    await expect(
      subscriptionService.subscribeUser('user1', '123', {
        capital: 10000,
        riskPerTrade: 0.02,
        brokerCredentialId: 'broker1'
      })
    ).rejects.toThrow('Already subscribed');
  });
});
```

### Integration Testing APIs

```typescript
import request from 'supertest';
import { app } from '../server';
import { prisma } from '../lib/prisma';

describe('Strategy Upload API', () => {
  let authToken: string;

  beforeAll(async () => {
    // Create test user and get token
    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    authToken = response.body.token;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({ where: { email: 'test@example.com' } });
  });

  test('GET /api/strategy-upload/strategies returns list', async () => {
    const response = await request(app)
      .get('/api/strategy-upload/strategies')
      .expect(200);

    expect(response.body).toHaveProperty('strategies');
    expect(Array.isArray(response.body.strategies)).toBe(true);
  });

  test('POST /api/strategy-upload/strategies creates strategy', async () => {
    const response = await request(app)
      .post('/api/strategy-upload/strategies')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test Strategy',
        code: 'test_strategy',
        strategyCode: 'def main(): pass',
        executionConfig: { symbol: 'BTCUSDT', resolution: '5' }
      })
      .expect(201);

    expect(response.body.strategy).toHaveProperty('id');
  });
});
```

---

## Summary

This backend implementation demonstrates:

1. **Service-Oriented Architecture:** Core logic in services, routes are thin
2. **Distributed Systems:** Redis locks, multi-worker support
3. **Cache Strategy:** Redis for speed, Database for persistence
4. **Background Jobs:** Cron-based scheduling
5. **Type Safety:** TypeScript throughout
6. **Database Migrations:** Prisma for schema management
7. **API Design:** RESTful endpoints with consistent patterns
8. **Error Handling:** Centralized middleware
9. **Testing:** Unit and integration tests

**Key Files to Study:**
- `services/strategy-execution/execution-coordinator.ts` - Core execution logic
- `workers/strategy-scheduler.ts` - Background scheduling
- `routes/strategy-execution.ts` - API endpoints
- `prisma/schema.prisma` - Database schema

**Next:** Read FRONTEND_GUIDE.md to understand the client-side implementation.
