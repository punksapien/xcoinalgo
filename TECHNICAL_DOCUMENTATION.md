# XcoinAlgo - Complete Technical Documentation

**Version**: 2.0 (Production Trading)
**Last Updated**: January 2025

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Core Services Deep Dive](#core-services-deep-dive)
4. [Trading Flow](#trading-flow)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [Background Workers](#background-workers)
8. [Security & Risk Management](#security--risk-management)
9. [Design Decisions](#design-decisions)

---

## System Overview

XcoinAlgo is a **multi-tenant algorithmic trading platform** that enables users to deploy automated trading strategies on CoinDCX exchange. The platform handles strategy execution, order management, risk management (stop loss/take profit), and performance tracking.

### Key Characteristics

**Multi-Tenant Execution:**
- One strategy executes once per candle
- Signal distributed to all active subscribers
- Each subscriber has personalized risk parameters
- Isolated broker credentials per user

**Production Trading:**
- Real orders placed on CoinDCX exchange
- Automatic stop loss and take profit orders
- Background monitoring of order status
- Real-time position and P&L tracking

**Performance Validation:**
- Backtest engine for historical simulation
- Performance metrics (Sharpe, drawdown, win rate)
- Trade-by-trade analysis
- Equity curve generation

---

## Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Strategy │ │  Broker  │ │Positions │ │ Backtest │      │
│  │Marketplace│ │  Setup   │ │Dashboard │ │ Results  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express + TypeScript)            │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              API Routes Layer                         │  │
│  │  /auth  /broker  /strategies  /positions  /backtest  │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Core Services Layer                        │  │
│  │                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │  │
│  │  │  CoinDCX   │  │  Backtest  │  │   Order    │    │  │
│  │  │   Client   │  │   Engine   │  │  Manager   │    │  │
│  │  └────────────┘  └────────────┘  └────────────┘    │  │
│  │                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │  │
│  │  │ Execution  │  │ Strategy   │  │Subscription│    │  │
│  │  │Coordinator │  │  Registry  │  │  Service   │    │  │
│  │  └────────────┘  └────────────┘  └────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Background Workers                         │  │
│  │  ┌────────────────┐  ┌──────────────────┐          │  │
│  │  │Strategy Executor│  │  Order Monitor   │          │  │
│  │  │(Cron: 1m, 5m..) │  │ (Cron: 1 minute) │          │  │
│  │  └────────────────┘  └──────────────────┘          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
┌───────────────┐    ┌──────────────┐    ┌─────────────────┐
│   PostgreSQL  │    │    Redis     │    │  CoinDCX API    │
│   (Prisma)    │    │  (Cache +    │    │  (Live Trading) │
│               │    │   Locking)   │    │                 │
└───────────────┘    └──────────────┘    └─────────────────┘
```

### Technology Stack

**Backend:**
- Node.js 18+
- TypeScript 5.x
- Express.js (REST API)
- Prisma (ORM)
- PostgreSQL (Database)
- Redis (Caching + Locking)
- node-cron (Scheduling)

**Frontend:**
- Next.js 15
- React 18
- TypeScript
- TailwindCSS
- Shadcn UI

**External Services:**
- CoinDCX API (Trading)
- Google OAuth (Authentication)

---

## Core Services Deep Dive

### 1. CoinDCX Client

**File:** `backend/services/coindcx-client.ts`

**Purpose:** Complete API wrapper for CoinDCX exchange operations.

**Key Functions:**

```typescript
// Account Management
async function getBalances(
  encryptedApiKey: string,
  encryptedApiSecret: string
): Promise<Balance[]>

async function getBalance(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  currency: string
): Promise<Balance | null>

// Order Placement
async function placeMarketOrder(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  params: {
    market: string;  // e.g., "BTCINR"
    side: 'buy' | 'sell';
    total_quantity: number;
    client_order_id?: string;
  }
): Promise<Order>

async function placeLimitOrder(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  params: {
    market: string;
    side: 'buy' | 'sell';
    price_per_unit: number;
    total_quantity: number;
    client_order_id?: string;
  }
): Promise<Order>

// Order Management
async function getOrderStatus(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  orderId: string
): Promise<Order>

async function cancelOrder(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  orderId: string
): Promise<{ message: string }>

async function getActiveOrders(
  encryptedApiKey: string,
  encryptedApiSecret: string,
  market?: string
): Promise<Order[]>

// Historical Data
async function getHistoricalCandles(
  market: string,
  interval: '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '1d' | '1w' | '1M',
  limit: number = 500
): Promise<OHLCVCandle[]>

// Market Data
async function getTicker(market: string): Promise<Ticker>
async function getAllTickers(): Promise<Ticker[]>
async function getOrderBook(market: string): Promise<OrderBook>
```

**Implementation Details:**

1. **Rate Limiting:**
   - 100ms delay between requests
   - Prevents API throttling
   - Tracks last request time globally

2. **Authentication:**
   - HMAC-SHA256 signature for all private endpoints
   - Timestamp included in every request
   - API keys decrypted from database just-in-time

3. **Error Handling:**
   - Catches network failures
   - Logs detailed error information
   - Returns consistent error format

**Example Usage:**

```typescript
// In execution coordinator
const order = await CoinDCXClient.placeMarketOrder(
  brokerCredential.apiKey,    // Encrypted
  brokerCredential.apiSecret, // Encrypted
  {
    market: 'BTCINR',
    side: 'buy',
    total_quantity: 0.001,
    client_order_id: 'xcoin_' + Date.now()
  }
);

// For backtesting
const candles = await CoinDCXClient.getHistoricalCandles(
  'BTCINR',
  '1h',
  500
);
```

---

### 2. Execution Coordinator

**File:** `backend/services/strategy-execution/execution-coordinator.ts`

**Purpose:** Orchestrates the complete trade execution workflow from signal generation to order placement.

**Workflow:**

```
1. Acquire Distributed Lock (Redis)
   ↓
2. Fetch Active Subscribers
   ↓
3. Execute Python Strategy ONCE
   ↓
4. Parse Signal (LONG/SHORT/HOLD/EXIT)
   ↓
5. Fan-out to ALL Subscribers
   ├── Calculate Position Size (per user)
   ├── Place Entry Order (Market)
   ├── Place Stop Loss (Limit)
   ├── Place Take Profit (Limit)
   └── Create Trade Record (Database)
   ↓
6. Update Execution Status (Redis)
   ↓
7. Emit Events (Success/Failure)
```

**Key Method: executeStrategy()**

```typescript
async executeStrategy(
  strategyId: string,
  scheduledTime: Date,
  workerId: string
): Promise<ExecutionResult>
```

**Steps:**

1. **Validation:**
   - Check execution timing (within 2 seconds of schedule)
   - Fetch strategy settings from Redis
   - Build interval key (e.g., "2024-01-01T10:00:00_5m")

2. **Distributed Locking:**
   ```typescript
   const lockAcquired = await settingsService.acquireExecutionLock(
     strategyId,
     intervalKey,
     lockTTL,
     workerId
   );
   ```
   - Prevents duplicate execution across multiple workers
   - Lock TTL = 10x resolution time
   - Lock stored in Redis with worker ID

3. **Subscriber Resolution:**
   ```typescript
   const subscribers = await subscriptionService.getActiveSubscribers(strategyId);
   ```
   - Filters: isActive=true, isPaused=false
   - Includes broker credentials
   - Includes risk parameters

4. **Strategy Execution:**
   ```typescript
   const pythonResult = await this.executePythonStrategy(
     strategyId,
     strategySettings,
     scheduledTime
   );
   ```
   - Spawns Python subprocess
   - Passes OHLCV data as JSON
   - Parses signal from stdout
   - 30-second timeout

5. **Signal Processing:**
   ```typescript
   for (const subscriber of subscribers) {
     await this.processSignalForSubscriber(
       subscriber,
       signal,
       strategySettings
     );
   }
   ```

**Key Method: processSignalForSubscriber()**

```typescript
private async processSignalForSubscriber(
  subscription: any,
  signal: StrategySignal,
  strategySettings: any
): Promise<boolean>
```

**Steps:**

1. **Position Size Calculation:**
   ```typescript
   const positionSize = this.calculatePositionSize(
     userSettings.capital,      // 10000
     userSettings.risk_per_trade, // 0.02 (2%)
     signal.price,              // 45000
     signal.stopLoss,           // 44000
     userSettings.leverage      // 10x
   );
   ```

   **Formula:**
   ```
   If stopLoss provided:
     riskAmount = capital * riskPerTrade
     stopLossDistance = |entryPrice - stopLoss|
     positionSize = (riskAmount / stopLossDistance) * leverage

   If no stopLoss:
     riskAmount = capital * riskPerTrade
     positionSize = (riskAmount * leverage) / entryPrice
   ```

2. **Order Placement:**
   ```typescript
   const orderResult = await this.placeOrderWithTracking(
     strategySettings.symbol,  // "BTC-USDT"
     signal.signal,            // "LONG"
     positionSize,             // 0.0222
     signal.price,             // 45000
     signal.stopLoss,          // 44000
     signal.takeProfit,        // 50000
     apiKey,
     apiSecret
   );
   ```

   **This places 3 orders:**
   - **Entry**: Market order (fills immediately)
   - **Stop Loss**: Limit order at SL price
   - **Take Profit**: Limit order at TP price

3. **Trade Record Creation:**
   ```typescript
   const trade = await prisma.trade.create({
     data: {
       subscriptionId: subscription.id,
       strategyId: subscription.strategyId,
       symbol: strategySettings.symbol,
       side: signal.signal.includes('LONG') ? 'LONG' : 'SHORT',
       quantity: positionSize,
       entryPrice: signal.price,
       stopLoss: signal.stopLoss,
       takeProfit: signal.takeProfit,
       status: 'OPEN',
       entryTime: new Date(),
       metadata: {
         orderId: orderResult.orderId,
         stopLossOrderId: orderResult.stopLossOrderId,
         takeProfitOrderId: orderResult.takeProfitOrderId,
         allOrderIds: orderResult.allOrderIds,
         exchange: 'coindcx',
         riskManagement: {
           stopLoss: signal.stopLoss,
           takeProfit: signal.takeProfit,
           hasStopLoss: !!orderResult.stopLossOrderId,
           hasTakeProfit: !!orderResult.takeProfitOrderId,
         },
       },
     },
   });
   ```

**Important Design Decision:**

**Q: Why place SL/TP immediately instead of monitoring price?**

**A:**
- **Exchange-side execution**: CoinDCX executes the order when price is hit, even if our server is down
- **No latency**: Order fills immediately when price touches SL/TP
- **Failsafe**: Protects against system failures
- **Accurate fills**: Exchange matching engine ensures fair price

---

### 3. Order Manager

**File:** `backend/services/order-manager.ts`

**Purpose:** Monitors open trades and manages stop loss/take profit order lifecycle.

**Key Responsibilities:**

1. **Monitor Order Status**
2. **Handle SL/TP Triggers**
3. **Cancel Opposite Orders**
4. **Update Trade Records**
5. **Calculate Realized P&L**

**Main Method: monitorTradeOrders()**

```typescript
async monitorTradeOrders(tradeId: string): Promise<void>
```

**Workflow:**

```
1. Fetch Trade from Database
   ↓
2. Extract Order IDs from Metadata
   ↓
3. Check Status of All Orders (CoinDCX API)
   ├── Entry Order
   ├── Stop Loss Order
   └── Take Profit Order
   ↓
4. Detect If SL or TP Filled
   ↓
5. If Filled:
   ├── Cancel Opposite Order
   ├── Calculate P&L
   ├── Update Trade Status to CLOSED
   └── Store Exit Details
```

**Example Scenario:**

```typescript
// Trade opened with 3 orders:
// - Entry: filled at 45000
// - SL: limit order at 44000
// - TP: limit order at 50000

// Price drops to 44000, SL fills:
{
  orderId: "sl_123",
  status: "filled",
  orderType: "STOP_LOSS"
}

// Order Manager Actions:
1. Detects SL filled
2. Cancels TP order (tp_456)
3. Calculates P&L:
   side = LONG
   entry = 45000
   exit = 44000
   quantity = 0.0222
   pnl = (44000 - 45000) * 0.0222 = -22.2 USD

4. Updates trade:
   status = CLOSED
   exitPrice = 44000
   exitTime = now
   pnl = -22.2
   pnlPct = -2.22%
   metadata.exitType = "STOP_LOSS"
```

**P&L Calculation:**

```typescript
private calculatePnl(
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  exitPrice: number,
  quantity: number
): number {
  if (side === 'LONG') {
    return (exitPrice - entryPrice) * quantity;
  } else {
    return (entryPrice - exitPrice) * quantity;
  }
}
```

**Background Monitoring:**

```typescript
// Called every minute by worker
async monitorAllOpenTrades(): Promise<void> {
  const openTrades = await prisma.trade.findMany({
    where: { status: 'OPEN' }
  });

  await Promise.all(
    openTrades.map(trade => this.monitorTradeOrders(trade.id))
  );
}
```

---

### 4. Backtest Engine

**File:** `backend/services/backtest-engine.ts`

**Purpose:** Simulate strategy performance on historical data before live deployment.

**Configuration:**

```typescript
interface BacktestConfig {
  strategyId: string;
  symbol: string;
  resolution: '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1d';
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  riskPerTrade: number;
  leverage: number;
  commission: number;  // e.g., 0.001 for 0.1%
}
```

**Workflow:**

```
1. Fetch Historical Candles from CoinDCX
   ↓
2. For Each Candle:
   ├── Execute Strategy Code
   ├── Parse Signal
   ├── Check SL/TP Hit (within candle)
   ├── Calculate Position Size
   ├── Simulate Order Fill
   └── Track Trade
   ↓
3. Calculate Performance Metrics
   ├── Total Trades
   ├── Win Rate
   ├── Sharpe Ratio
   ├── Max Drawdown
   ├── Profit Factor
   └── Equity Curve
   ↓
4. Store Results in Database
```

**Key Implementation Details:**

**1. Realistic Order Fills:**

```typescript
// Entry: Use closing price of candle
entryPrice = currentCandle.close;

// Exit on SL: Use SL price if low <= SL
if (currentCandle.low <= position.stopLoss) {
  exitPrice = position.stopLoss;
  reason = 'STOP_LOSS';
}

// Exit on TP: Use TP price if high >= TP
if (currentCandle.high >= position.takeProfit) {
  exitPrice = position.takeProfit;
  reason = 'TAKE_PROFIT';
}
```

**2. Commission Calculation:**

```typescript
const entryCommission = entryPrice * quantity * commission;
const exitCommission = exitPrice * quantity * commission;
const totalCommission = entryCommission + exitCommission;
const netPnl = grossPnl - totalCommission;
```

**3. Performance Metrics:**

```typescript
// Win Rate
winRate = (winningTrades / totalTrades) * 100

// Profit Factor
profitFactor = totalWins / totalLosses

// Sharpe Ratio (simplified, annualized)
avgReturn = mean(tradeReturns)
stdDev = standardDeviation(tradeReturns)
sharpeRatio = (avgReturn / stdDev) * sqrt(252)

// Max Drawdown
for each equity point:
  if equity > peak:
    peak = equity
  drawdown = peak - equity
  drawdownPct = (drawdown / peak) * 100
  maxDrawdown = max(maxDrawdown, drawdown)
```

**4. Equity Curve:**

```typescript
interface EquityPoint {
  time: Date;
  equity: number;
  drawdown: number;
}

// Updated after each trade
currentEquity = capital + unrealizedPnl;
maxEquity = max(maxEquity, currentEquity);
drawdown = maxEquity - currentEquity;

equityCurve.push({
  time: currentCandle.time,
  equity: currentEquity,
  drawdown: drawdown
});
```

**Example Result:**

```typescript
{
  "metrics": {
    "totalTrades": 45,
    "winningTrades": 28,
    "losingTrades": 17,
    "winRate": 62.22,
    "totalPnl": 1542.50,
    "totalPnlPct": 15.43,
    "avgWin": 89.30,
    "avgLoss": -42.15,
    "largestWin": 234.50,
    "largestLoss": -98.20,
    "profitFactor": 2.34,
    "sharpeRatio": 1.87,
    "maxDrawdown": 345.20,
    "maxDrawdownPct": 3.12,
    "averageTradeDuration": 142.5,
    "totalCommission": 15.42,
    "netPnl": 1527.08,
    "finalCapital": 11527.08
  },
  "trades": [...],
  "equityCurve": [...]
}
```

---

### 5. Strategy Registry

**File:** `backend/services/strategy-execution/strategy-registry.ts`

**Purpose:** Track which strategies need execution for which candle (symbol + resolution).

**Data Structure:**

```
Redis:
  candle:BTCUSDT:5:strategies -> Set<strategyId>
  candle:ETHINR:1:strategies -> Set<strategyId>

In-Memory Cache:
  Map<"BTCUSDT:5", Set<"strategy-1", "strategy-2">>
```

**Key Methods:**

```typescript
async registerStrategy(
  strategyId: string,
  symbol: string,
  resolution: string
): Promise<void>

async getStrategiesForCandle(
  symbol: string,
  resolution: string
): Promise<string[]>

async unregisterStrategy(
  strategyId: string,
  symbol: string,
  resolution: string
): Promise<void>
```

**Usage in Scheduler:**

```typescript
// When candle closes (e.g., BTCUSDT 5m at 10:05:00)
const strategies = await strategyRegistry.getStrategiesForCandle(
  'BTCUSDT',
  '5'
);

// Execute each strategy
for (const strategyId of strategies) {
  await executionCoordinator.executeStrategy(
    strategyId,
    new Date('2024-01-01T10:05:00'),
    workerId
  );
}
```

---

### 6. Settings Service

**File:** `backend/services/strategy-execution/settings-service.ts`

**Purpose:** Fast access to strategy and subscription settings via Redis cache.

**Cached Data:**

```typescript
// Strategy Settings
strategy:{strategyId}:settings -> {
  symbol: "BTCUSDT",
  resolution: "5",
  strategyCode: "def main(data): ..."
}

// User Subscription Settings
subscription:{userId}:{strategyId}:settings -> {
  capital: 10000,
  risk_per_trade: 0.02,
  leverage: 10,
  is_active: true,
  is_paused: false
}

// Execution Lock
lock:strategy:{strategyId}:interval:{intervalKey} -> {
  worker_id: "worker-1",
  acquired_at: "2024-01-01T10:05:00"
}
```

**Key Methods:**

```typescript
async getStrategySettings(strategyId: string): Promise<StrategySettings>
async getSubscriptionSettings(userId: string, strategyId: string): Promise<UserSettings>
async acquireExecutionLock(strategyId: string, intervalKey: string, ttl: number, workerId: string): Promise<boolean>
async updateExecutionStatus(strategyId: string, metadata: any): Promise<void>
```

**Lock Implementation:**

```typescript
async acquireExecutionLock(
  strategyId: string,
  intervalKey: string,
  ttl: number,
  workerId: string
): Promise<boolean> {
  const lockKey = `lock:strategy:${strategyId}:interval:${intervalKey}`;

  // Try to set lock (NX = only if not exists)
  const acquired = await redis.set(
    lockKey,
    JSON.stringify({ worker_id: workerId, acquired_at: new Date() }),
    'EX', ttl,
    'NX'
  );

  return acquired === 'OK';
}
```

---

## Trading Flow

### Complete Trade Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│ 1. CANDLE CLOSES (e.g., BTCUSDT 5m at 10:05:00)             │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. STRATEGY SCHEDULER (Cron Job)                             │
│    - Detects candle close                                     │
│    - Queries registry for strategies                          │
│    - Triggers executionCoordinator.executeStrategy()          │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. EXECUTION COORDINATOR                                      │
│    Step 1: Acquire distributed lock                           │
│    Step 2: Fetch active subscribers (3 users)                 │
│    Step 3: Execute Python strategy ONCE                       │
│    Step 4: Parse signal: LONG @ 45000, SL: 44000, TP: 50000 │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. FAN-OUT TO SUBSCRIBERS (Parallel)                         │
│                                                               │
│    User A (Capital: $10k, Risk: 2%)                          │
│    ├── Position Size: 0.0222 BTC                             │
│    ├── Entry Order: MARKET BUY 0.0222 BTC @ 45000            │
│    ├── SL Order: LIMIT SELL 0.0222 BTC @ 44000               │
│    ├── TP Order: LIMIT SELL 0.0222 BTC @ 50000               │
│    └── Trade Record Created (status: OPEN)                    │
│                                                               │
│    User B (Capital: $50k, Risk: 1%)                          │
│    ├── Position Size: 0.0111 BTC                             │
│    └── ... same flow ...                                      │
│                                                               │
│    User C (Capital: $5k, Risk: 3%)                           │
│    └── ... same flow ...                                      │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 5. COINDCX EXCHANGE                                           │
│    - Entry order fills immediately (market order)             │
│    - SL & TP orders sit in orderbook                          │
│    - User now has open position                               │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 6. ORDER MONITOR (Background Worker - Every 1 Minute)        │
│    - Queries all trades with status=OPEN                      │
│    - Checks order status via CoinDCX API                      │
│    - Detects if SL or TP filled                               │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 7. SCENARIO: STOP LOSS TRIGGERS                              │
│    - Price drops to 44000                                     │
│    - SL order fills on exchange                               │
│    - Order Monitor detects: order status = "filled"           │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 8. ORDER MANAGER ACTIONS                                      │
│    Step 1: Cancel TP order (no longer needed)                 │
│    Step 2: Calculate P&L                                       │
│            Entry: 45000, Exit: 44000, Qty: 0.0222             │
│            PnL = (44000 - 45000) * 0.0222 = -$22.20           │
│    Step 3: Update trade record                                 │
│            status = CLOSED                                     │
│            exitPrice = 44000                                   │
│            pnl = -22.20                                        │
│            exitType = "STOP_LOSS"                              │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 9. USER DASHBOARD                                             │
│    - Positions: 0 open                                         │
│    - Orders: Entry (filled), SL (filled), TP (cancelled)      │
│    - P&L: -$22.20 (-2.22%)                                    │
│    - Trade History: 1 completed trade                          │
└──────────────────────────────────────────────────────────────┘
```

### Alternate Scenario: Take Profit Triggers

```
Price rises to $50,000
   ↓
TP order fills on exchange
   ↓
Order Monitor detects fill
   ↓
Order Manager:
   - Cancels SL order
   - Calculates P&L: (50000 - 45000) * 0.0222 = $111.00
   - Updates trade: status=CLOSED, exitType="TAKE_PROFIT"
```

### Alternate Scenario: Manual Exit (Strategy Signal)

```
Strategy returns EXIT_LONG signal
   ↓
Execution Coordinator:
   - Places market sell order
   - Gets fill price (e.g., 47500)
   ↓
Order Manager:
   - Cancels both SL and TP orders
   - Calculates P&L: (47500 - 45000) * 0.0222 = $55.50
   - Updates trade: status=CLOSED, exitType="SIGNAL"
```

---

## Database Schema

### Core Tables

```prisma
model User {
  id               String   @id @default(uuid())
  email            String   @unique
  password         String?  // Null for OAuth users
  googleId         String?  @unique
  name             String?
  profileImage     String?
  emailVerified    Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  // Relations
  strategies          Strategy[]
  subscriptions       Subscription[]
  brokerCredentials   BrokerCredential[]
  trades              Trade[]
}

model Strategy {
  id                String   @id @default(uuid())
  userId            String
  name              String
  code              String   @db.Text  // Python code
  description       String?  @db.Text
  author            String
  version           String   @default("1.0.0")
  instrument        String   // e.g., "BTCUSDT"
  resolution        String   // e.g., "5m"
  isActive          Boolean  @default(true)
  tags              String?  // Comma-separated

  // Validation
  validationStatus  String?  // "pending", "passed", "failed"
  validationErrors  String?  @db.Text
  lastValidatedAt   DateTime?

  // Git integration
  gitRepository     String?
  gitBranch         String?  @default("main")
  gitCommitHash     String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relations
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subscriptions     Subscription[]
  executions        StrategyExecution[]
  backtestResults   BacktestResult[]

  @@index([userId])
  @@index([isActive])
}

model Subscription {
  id                String   @id @default(uuid())
  userId            String
  strategyId        String
  brokerCredentialId String?

  // Risk Parameters
  capital           Float    // Total capital allocated
  riskPerTrade      Float    // Risk per trade (0.02 = 2%)
  leverage          Float    @default(1)

  // Status
  isActive          Boolean  @default(true)
  isPaused          Boolean  @default(false)

  // Timestamps
  subscribedAt      DateTime @default(now())
  pausedAt          DateTime?
  unsubscribedAt    DateTime?

  // Relations
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  strategy          Strategy @relation(fields: [strategyId], references: [id], onDelete: Cascade)
  brokerCredential  BrokerCredential? @relation(fields: [brokerCredentialId], references: [id])
  trades            Trade[]

  @@unique([userId, strategyId])
  @@index([isActive])
}

model BrokerCredential {
  id                String   @id @default(uuid())
  userId            String
  brokerName        String   // "coindcx"
  apiKey            String   // Encrypted
  apiSecret         String   // Encrypted
  isActive          Boolean  @default(true)
  connectedAt       DateTime @default(now())
  lastTestedAt      DateTime?

  // Relations
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subscriptions     Subscription[]

  @@unique([userId, brokerName])
}

model Trade {
  id                String   @id @default(uuid())
  subscriptionId    String
  strategyId        String
  userId            String

  // Trade Details
  symbol            String
  side              String   // "LONG" or "SHORT"
  quantity          Float
  entryPrice        Float
  exitPrice         Float?

  // Risk Management
  stopLoss          Float?
  takeProfit        Float?

  // Status
  status            String   // "OPEN", "CLOSED"

  // P&L
  pnl               Float?
  pnlPct            Float?

  // Timestamps
  entryTime         DateTime
  exitTime          DateTime?

  // Metadata (JSON)
  metadata          Json?    // Order IDs, exit reason, etc.

  // Relations
  subscription      Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
  @@index([entryTime])
}

model StrategyExecution {
  id                String   @id @default(uuid())
  strategyId        String
  intervalKey       String   // e.g., "2024-01-01T10:05:00_5m"
  executedAt        DateTime @default(now())

  // Execution Details
  status            String   // "SUCCESS", "FAILED", "SKIPPED", "NO_SIGNAL"
  signalType        String?  // "LONG", "SHORT", "HOLD", etc.
  subscribersCount  Int
  tradesGenerated   Int
  durationMs        Int
  workerId          String
  error             String?  @db.Text

  // Relations
  strategy          Strategy @relation(fields: [strategyId], references: [id], onDelete: Cascade)

  @@index([strategyId])
  @@index([executedAt])
}

model BacktestResult {
  id                String   @id @default(uuid())
  strategyId        String
  createdAt         DateTime @default(now())

  // Configuration (JSON)
  config            Json

  // Results (JSON)
  metrics           Json     // Performance metrics
  tradeHistory      Json     // All trades
  equityCurve       Json     // Equity over time

  // Metadata
  executionTime     Int      // milliseconds

  // Relations
  strategy          Strategy @relation(fields: [strategyId], references: [id], onDelete: Cascade)

  @@index([strategyId])
  @@index([createdAt])
}
```

### Key Design Decisions

**1. Trade Metadata (JSON field):**
```json
{
  "orderId": "entry_order_123",
  "stopLossOrderId": "sl_order_456",
  "takeProfitOrderId": "tp_order_789",
  "allOrderIds": ["entry_order_123", "sl_order_456", "tp_order_789"],
  "exchange": "coindcx",
  "exitType": "STOP_LOSS",
  "riskManagement": {
    "stopLoss": 44000,
    "takeProfit": 50000,
    "hasStopLoss": true,
    "hasTakeProfit": true
  }
}
```

**Why JSON for metadata?**
- Flexible: Can add new fields without migrations
- Order IDs vary by exchange
- Exit reasons can be extended
- Performance metrics can be added later

**2. Subscription-Trade Relationship:**
```
User -> Subscription -> Trade
     -> Strategy
```

**Why this structure?**
- User can have multiple subscriptions
- Each subscription has its own risk parameters
- Trades belong to subscriptions (not strategies directly)
- Easy to track per-subscription performance

**3. Encrypted Broker Credentials:**
```typescript
// Encryption (before save)
import { encrypt } from './utils/simple-crypto';
const encryptedKey = encrypt(apiKey);

// Decryption (before use)
import { decrypt } from './utils/simple-crypto';
const apiKey = decrypt(broker.apiKey);
```

**Why encrypt?**
- Regulatory compliance
- Prevents plain-text exposure
- Per-user encryption keys possible

---

## API Reference

### Authentication

All protected endpoints require JWT token:

```
Authorization: Bearer <jwt_token>
```

### Broker Integration

#### Store Broker Credentials
```http
POST /api/broker/keys
Content-Type: application/json
Authorization: Bearer <token>

{
  "apiKey": "your_api_key",
  "apiSecret": "your_api_secret"
}

Response: 200 OK
{
  "success": true,
  "message": "Credentials stored successfully"
}
```

#### Test Broker Connection
```http
POST /api/broker/test
Content-Type: application/json
Authorization: Bearer <token>

{
  "apiKey": "your_api_key",
  "apiSecret": "your_api_secret"
}

Response: 200 OK
{
  "success": true,
  "message": "Connection successful",
  "balances": [...]
}
```

#### Get Broker Status
```http
GET /api/broker/status
Authorization: Bearer <token>

Response: 200 OK
{
  "connected": true,
  "brokerName": "coindcx",
  "connectedAt": "2024-01-01T10:00:00Z",
  "lastUpdated": "2024-01-01T11:00:00Z"
}
```

### Positions & Orders

#### Get Current Positions
```http
GET /api/positions/current
Authorization: Bearer <token>

Response: 200 OK
{
  "positions": [
    {
      "id": "pos_BTC_user123",
      "instrument": "BTCINR",
      "currency": "BTC",
      "side": "LONG",
      "size": 0.0222,
      "lockedSize": 0.0222,
      "availableSize": 0,
      "entryPrice": 45000,
      "currentPrice": 47000,
      "unrealizedPnl": 44.4,
      "unrealizedPnlPct": 4.44,
      "leverage": 1,
      "marginUsed": 999,
      "openTime": "2024-01-01T10:05:00Z",
      "lastUpdate": "2024-01-01T11:00:00Z",
      "activeOrders": 2
    }
  ],
  "summary": {
    "totalPositions": 1,
    "totalUnrealizedPnl": 44.4,
    "totalMarginUsed": 999,
    "activeStrategies": 1,
    "activeOrders": 2
  }
}
```

#### Get Order History
```http
GET /api/positions/orders?page=1&limit=20&status=all
Authorization: Bearer <token>

Response: 200 OK
{
  "orders": [
    {
      "id": "order_123",
      "market": "BTCINR",
      "type": "MARKET",
      "side": "BUY",
      "amount": 0.0222,
      "price": 45000,
      "filled": 0.0222,
      "remaining": 0,
      "status": "FILLED",
      "fees": 0.999,
      "createdAt": "2024-01-01T10:05:00Z",
      "updatedAt": "2024-01-01T10:05:02Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "summary": {
    "totalOrders": 45,
    "filledOrders": 42,
    "pendingOrders": 3,
    "totalVolume": 1.5,
    "totalFees": 67.5
  }
}
```

#### Get P&L Summary
```http
GET /api/positions/pnl?period=7d
Authorization: Bearer <token>

Response: 200 OK
{
  "summary": {
    "totalRealizedPnl": 1542.50,
    "totalUnrealizedPnl": 44.40,
    "totalPnl": 1586.90,
    "totalTrades": 45,
    "winRate": 62.22,
    "activeStrategies": 3,
    "averageWin": 89.30,
    "profitFactor": 2.34
  },
  "dailyPnl": [
    {
      "date": "2024-01-01",
      "pnl": 234.50,
      "cumulativePnl": 234.50
    },
    ...
  ],
  "strategyPerformance": [
    {
      "strategyId": "strategy-1",
      "strategyName": "SMA Crossover",
      "strategyCode": "sma_crossover",
      "realizedPnl": 542.30,
      "trades": 15,
      "winRate": 66.67,
      "isActive": true
    }
  ]
}
```

### Backtesting

#### Run Backtest
```http
POST /api/backtest/run
Content-Type: application/json
Authorization: Bearer <token>

{
  "strategyId": "strategy-1",
  "symbol": "BTCUSDT",
  "resolution": "1h",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "initialCapital": 10000,
  "riskPerTrade": 0.02,
  "leverage": 1,
  "commission": 0.001
}

Response: 200 OK
{
  "success": true,
  "result": {
    "metrics": {
      "totalTrades": 45,
      "winningTrades": 28,
      "losingTrades": 17,
      "winRate": 62.22,
      "totalPnl": 1542.50,
      "totalPnlPct": 15.43,
      "sharpeRatio": 1.87,
      "maxDrawdown": 345.20,
      "maxDrawdownPct": 3.12,
      "profitFactor": 2.34
    },
    "totalTrades": 45,
    "executionTime": 3524,
    "equityCurve": [...],
    "recentTrades": [...]
  }
}
```

#### Get Backtest History
```http
GET /api/backtest/history/strategy-1?limit=10
Authorization: Bearer <token>

Response: 200 OK
{
  "results": [
    {
      "id": "backtest-1",
      "createdAt": "2024-01-15T10:00:00Z",
      "config": {...},
      "metrics": {...},
      "executionTime": 3524
    }
  ]
}
```

### Strategy Execution (Subscriptions)

#### Subscribe to Strategy
```http
POST /api/strategies/subscribe
Content-Type: application/json
Authorization: Bearer <token>

{
  "strategyId": "strategy-1",
  "capital": 10000,
  "riskPerTrade": 0.02,
  "leverage": 1,
  "brokerCredentialId": "broker-1"
}

Response: 201 Created
{
  "success": true,
  "subscription": {
    "id": "subscription-1",
    "strategyId": "strategy-1",
    "capital": 10000,
    "riskPerTrade": 0.02,
    "leverage": 1,
    "isActive": true,
    "subscribedAt": "2024-01-01T10:00:00Z"
  }
}
```

#### Get User Subscriptions
```http
GET /api/strategies/subscriptions
Authorization: Bearer <token>

Response: 200 OK
{
  "subscriptions": [
    {
      "id": "subscription-1",
      "strategy": {
        "id": "strategy-1",
        "name": "SMA Crossover",
        "code": "sma_crossover"
      },
      "capital": 10000,
      "riskPerTrade": 0.02,
      "leverage": 1,
      "isActive": true,
      "isPaused": false,
      "subscribedAt": "2024-01-01T10:00:00Z"
    }
  ]
}
```

#### Pause Subscription
```http
PATCH /api/strategies/subscriptions/subscription-1/pause
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "subscription": {
    "id": "subscription-1",
    "isPaused": true,
    "pausedAt": "2024-01-02T10:00:00Z"
  }
}
```

---

## Background Workers

### 1. Strategy Executor

**File:** `backend/services/strategyExecutor.ts` or `backend/workers/strategy-scheduler.ts`

**Purpose:** Schedules strategy executions at candle boundaries.

**Cron Schedule:**

```typescript
// 1-minute candles: "0 * * * * *" (every minute at :00)
// 5-minute candles: "0 */5 * * * *" (every 5 minutes at :00, :05, :10...)
// 15-minute candles: "0 */15 * * * *"
// 1-hour candles: "0 0 * * * *"
// 1-day candles: "0 0 0 * * *"
```

**Implementation:**

```typescript
import cron from 'node-cron';

// For 5-minute candles
cron.schedule('0 */5 * * * *', async () => {
  const strategies = await strategyRegistry.getStrategiesForCandle('BTCUSDT', '5');

  const executionTime = new Date();

  for (const strategyId of strategies) {
    await executionCoordinator.executeStrategy(
      strategyId,
      executionTime,
      process.env.WORKER_ID || 'worker-1'
    );
  }
});
```

**Multi-Resolution Support:**

```typescript
// Multiple cron jobs for different resolutions
const schedules = [
  { cron: '0 * * * * *', resolution: '1' },
  { cron: '0 */5 * * * *', resolution: '5' },
  { cron: '0 */15 * * * *', resolution: '15' },
  { cron: '0 0 * * * *', resolution: '60' },
];

schedules.forEach(({ cron: cronExpr, resolution }) => {
  cron.schedule(cronExpr, async () => {
    await executeStrategiesForResolution(resolution);
  });
});
```

### 2. Order Monitor

**File:** `backend/workers/order-monitor.ts`

**Purpose:** Monitor open trades and detect SL/TP triggers.

**Cron Schedule:**

```typescript
// Runs every 1 minute
cron.schedule('0 * * * * *', async () => {
  await orderManager.monitorAllOpenTrades();
});
```

**Implementation:**

```typescript
export function startOrderMonitoring(): void {
  logger.info('Starting order monitoring service...');

  cron.schedule('0 * * * * *', async () => {
    try {
      logger.debug('Running order monitor check...');
      await orderManager.monitorAllOpenTrades();
    } catch (error) {
      logger.error('Order monitoring failed:', error);
    }
  });

  logger.info('✓ Order monitoring service started (runs every minute)');
}
```

**Why Every Minute?**
- Balance between responsiveness and API rate limits
- CoinDCX limit orders execute immediately when price is hit
- 1-minute delay in updating database is acceptable
- Reduces API call volume (important for rate limiting)

**Alternative Approaches Considered:**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| WebSocket from Exchange | Real-time updates | Complex, requires persistent connection | Not implemented (overkill) |
| Every 5 seconds | Near real-time | 12x more API calls | Too aggressive |
| Every 5 minutes | Fewer API calls | Delayed updates | Too slow |
| Every 1 minute | Good balance | 1-minute delay | ✅ Chosen |

---

## Security & Risk Management

### 1. API Key Encryption

**Encryption:**

```typescript
// utils/simple-crypto.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32-byte key
const ALGORITHM = 'aes-256-gcm';

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Usage:**

```typescript
// When storing
const encryptedKey = encrypt(apiKey);
await prisma.brokerCredential.create({
  data: {
    apiKey: encryptedKey,
    apiSecret: encrypt(apiSecret)
  }
});

// When using
const apiKey = decrypt(broker.apiKey);
const apiSecret = decrypt(broker.apiSecret);
await CoinDCXClient.placeOrder(apiKey, apiSecret, ...);
```

### 2. Position Sizing (Risk Management)

**Formula:**

```
Risk Amount = Capital × Risk Per Trade

If Stop Loss Provided:
  Stop Loss Distance = |Entry Price - Stop Loss|
  Position Size = (Risk Amount / Stop Loss Distance) × Leverage

If No Stop Loss:
  Position Size = (Risk Amount × Leverage) / Entry Price
```

**Example:**

```
Capital: $10,000
Risk Per Trade: 2% ($200)
Entry Price: $45,000
Stop Loss: $44,000
Leverage: 1x

Stop Loss Distance = 45000 - 44000 = $1,000
Position Size = ($200 / $1000) × 1 = 0.2 BTC

If SL triggers:
  Loss = 0.2 BTC × $1,000 = $200 ✓ (exactly 2% of capital)
```

**With Leverage:**

```
Capital: $10,000
Risk Per Trade: 2% ($200)
Entry Price: $45,000
Stop Loss: $44,000
Leverage: 10x

Stop Loss Distance = $1,000
Position Size = ($200 / $1000) × 10 = 2.0 BTC

If SL triggers:
  Loss = 2.0 BTC × $1,000 / 10 = $200 ✓ (still 2% of capital)
```

**Implementation:**

```typescript
private calculatePositionSize(
  capital: number,
  riskPerTrade: number,
  entryPrice: number,
  stopLoss?: number,
  leverage: number = 1
): number {
  if (!stopLoss) {
    // No SL: Use fixed percentage of capital
    const riskAmount = capital * riskPerTrade;
    return (riskAmount * leverage) / entryPrice;
  }

  // With SL: Calculate based on SL distance
  const riskAmount = capital * riskPerTrade;
  const stopLossDistance = Math.abs(entryPrice - stopLoss);
  const riskPerUnit = stopLossDistance;

  if (riskPerUnit === 0) {
    return 0;
  }

  return (riskAmount / riskPerUnit) * leverage;
}
```

### 3. Distributed Locking

**Purpose:** Prevent duplicate strategy execution across multiple workers.

**Implementation:**

```typescript
async acquireExecutionLock(
  strategyId: string,
  intervalKey: string,
  ttl: number,
  workerId: string
): Promise<boolean> {
  const lockKey = `lock:strategy:${strategyId}:interval:${intervalKey}`;

  // SET with NX (only if not exists) and EX (expiration)
  const result = await redis.set(
    lockKey,
    JSON.stringify({
      worker_id: workerId,
      acquired_at: new Date().toISOString()
    }),
    'EX', ttl,
    'NX'
  );

  return result === 'OK';
}
```

**Lock TTL Calculation:**

```typescript
function computeLockTTL(resolution: string, multiplier: number = 10): number {
  const resolutionMinutes = parseInt(resolution);
  return resolutionMinutes * 60 * multiplier; // seconds
}

// Example:
// 5-minute resolution: 5 * 60 * 10 = 3000 seconds (50 minutes)
// 1-hour resolution: 60 * 60 * 10 = 36000 seconds (10 hours)
```

**Why 10x multiplier?**
- Execution typically takes < 5 seconds
- 10x provides huge buffer for slow executions
- Lock auto-expires even if worker crashes
- Prevents indefinite locks

### 4. Error Handling

**Strategy Execution Failures:**

```typescript
try {
  const result = await executionCoordinator.executeStrategy(
    strategyId,
    scheduledTime,
    workerId
  );

  if (!result.success) {
    logger.error(`Strategy execution failed: ${result.error}`);
    // Log to database but don't crash
    await prisma.strategyExecution.create({
      data: {
        strategyId,
        status: 'FAILED',
        error: result.error,
        ...
      }
    });
  }
} catch (error) {
  logger.error('Unhandled execution error:', error);
  // Worker continues running
}
```

**Order Placement Failures:**

```typescript
try {
  const order = await CoinDCXClient.placeMarketOrder(...);
} catch (error) {
  // Order failed - don't create trade record
  logger.error('Order placement failed:', error);
  return {
    success: false,
    error: error.message
  };
}
```

**API Rate Limiting:**

```typescript
// Built into CoinDCX client
const RATE_LIMIT_DELAY = 100; // ms
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve =>
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
}
```

---

## Design Decisions

### 1. Why Multi-Tenant Architecture?

**Problem:** 100 users subscribe to same strategy. Without multi-tenant:
- Strategy executes 100 times per candle
- 100x API calls to exchange
- 100x computation
- Execution drift (users get different prices)

**Solution:** Execute strategy once, distribute signal:
- Strategy executes 1 time per candle
- 1x API call for data
- 100x order placement (unavoidable)
- All users get same signal simultaneously

**Implementation:**
```
executePythonStrategy() -> ONCE per candle
↓
Parse signal: LONG @ 45000
↓
For each subscriber:
  - Calculate personalized position size
  - Place order with their broker
  - Create trade record
```

### 2. Why Python for Strategies?

**Alternatives Considered:**
- JavaScript: Good, but less popular in quant finance
- Pine Script: TradingView-specific, limited libraries
- Python: Industry standard for algorithmic trading

**Python Advantages:**
- Pandas, NumPy, TA-Lib ecosystem
- Familiar to traders/quants
- Easy to write indicators
- Rich library support

**Implementation:**
- Strategies run in subprocess
- Isolated from Node.js process
- Timeout protection (30 seconds)
- JSON communication

### 3. Why Limit Orders for SL/TP?

**Alternative:** Monitor price in backend, place market order when hit

**Problems with monitoring approach:**
- Requires constant price watching
- System downtime = no protection
- Network latency affects fill price
- More complex infrastructure

**Limit Order Advantages:**
- Exchange-side execution (reliable)
- Works even if system is down
- Guaranteed price (or better)
- Simpler architecture

**Implementation:**
```
Place 3 orders immediately:
1. Market entry (fills now)
2. Limit SL (sits in orderbook)
3. Limit TP (sits in orderbook)

When price hits SL/TP:
- Exchange fills order automatically
- Our monitor detects fill (1-min delay)
- Cancel opposite order
- Update database
```

### 4. Why 1-Minute Order Monitoring?

**Alternatives:**
- WebSocket: Real-time but complex
- Every 5 seconds: Too many API calls
- Every 5 minutes: Too slow

**1-Minute Balance:**
- Good enough responsiveness
- Manageable API rate limiting
- Simple implementation
- Scales to many users

**Math:**
- 100 open trades
- Check every minute
- 100 API calls/minute
- 144,000 API calls/day
- Well within rate limits

### 5. Why Redis for Caching?

**What's Cached:**
- Strategy settings (avoid DB read every execution)
- Subscription settings (avoid DB read every execution)
- Distributed locks (prevent duplicate execution)
- Strategy registry (candle → strategies mapping)

**Why Not Just Database:**
- Redis: sub-millisecond reads
- PostgreSQL: 5-10ms reads
- For high-frequency execution, milliseconds matter

**Cache Invalidation:**
```typescript
// When user updates settings
await prisma.subscription.update({...});
await redis.set(`subscription:${userId}:${strategyId}:settings`, JSON.stringify(newSettings));
```

### 6. Why Separate Services vs Monolith?

**Services Created:**
- CoinDCXClient (exchange API)
- BacktestEngine (historical simulation)
- OrderManager (SL/TP lifecycle)
- ExecutionCoordinator (orchestration)
- StrategyRegistry (candle tracking)
- SettingsService (Redis cache)
- SubscriptionService (user management)

**Benefits:**
- **Testability:** Each service tested independently
- **Reusability:** CoinDCXClient used by multiple services
- **Maintainability:** Changes isolated to specific services
- **Scalability:** Can run services on different servers if needed

**Why Not Microservices:**
- Overhead not justified yet
- Simpler deployment
- Faster development
- Can split later if needed

### 7. Why Store Order IDs in Trade Metadata?

**Alternatives:**
- Separate `Order` table with `tradeId` foreign key
- Store only entry order ID

**Metadata Approach Benefits:**
- Flexible schema (easy to add fields)
- No additional JOIN queries
- Fast reads (single record)
- Easy to evolve

**Example Metadata:**
```json
{
  "orderId": "entry_123",
  "stopLossOrderId": "sl_456",
  "takeProfitOrderId": "tp_789",
  "allOrderIds": ["entry_123", "sl_456", "tp_789"],
  "exchange": "coindcx",
  "exitType": "STOP_LOSS",
  "fillPrices": {
    "entry": 45000,
    "exit": 44000
  }
}
```

### 8. Why Backtest Stores Results vs Real-time?

**Alternative:** Stream backtest results in real-time

**Problems:**
- Frontend needs to stay connected
- What if user closes browser?
- No history of backtest runs

**Store Results Benefits:**
- User can close browser
- View previous backtests
- Compare different parameters
- Share results with others

### 9. Why TypeScript Over JavaScript?

**Benefits:**
- Catch errors at compile time
- Better IDE autocomplete
- Self-documenting code
- Safer refactoring

**Example:**
```typescript
// TypeScript catches this at compile time
interface Trade {
  quantity: number;
  price: number;
}

const trade: Trade = {
  quantity: 0.01,
  pric: 45000  // Error: Did you mean 'price'?
};

// JavaScript silently fails at runtime
```

---

## Deployment Checklist

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/xcoinalgo"

# Redis
REDIS_URL="redis://localhost:6379"

# Encryption
ENCRYPTION_KEY="32-character-secret-key-here!!"  # 32 bytes

# JWT
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN="7d"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Session
SESSION_SECRET="your-session-secret"

# Frontend
FRONTEND_URL="https://xcoinalgo.com"
NEXT_PUBLIC_API_URL="https://xcoinalgo.com"

# Server
PORT=3001
NODE_ENV="production"

# Worker
WORKER_ID="worker-1"
```

### Pre-Deployment Steps

1. **Database Migration:**
   ```bash
   cd backend
   npx prisma migrate deploy
   npx prisma generate
   ```

2. **Build Frontend:**
   ```bash
   cd frontend
   npm run build
   ```

3. **Build Backend:**
   ```bash
   cd backend
   npm run build
   ```

4. **Test CoinDCX Connection:**
   ```bash
   # Test with valid API keys
   curl -X POST https://api.coindcx.com/exchange/v1/users/balances \
     -H "X-AUTH-APIKEY: your-key" \
     -H "X-AUTH-SIGNATURE: signature" \
     -H "Content-Type: application/json"
   ```

5. **Start Services:**
   ```bash
   # Using PM2
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

### Post-Deployment Verification

1. **Health Check:**
   ```bash
   curl https://xcoinalgo.com/health
   ```

2. **Test Strategy Execution:**
   - Subscribe to a test strategy
   - Wait for next candle close
   - Verify order placed on CoinDCX
   - Check trade record created

3. **Test Order Monitoring:**
   - Manually modify a test trade
   - Set SL/TP close to current price
   - Wait for price to hit
   - Verify monitor detects and closes trade

4. **Test Backtest:**
   - Run backtest on test strategy
   - Verify results stored
   - Check metrics calculation

5. **Monitor Logs:**
   ```bash
   pm2 logs
   tail -f /var/log/xcoinalgo/backend.log
   ```

---

## Troubleshooting

### Common Issues

**1. "Lock already held" - Strategy not executing**

**Cause:** Previous execution didn't release lock (worker crashed)

**Solution:**
```bash
# Clear lock in Redis
redis-cli DEL "lock:strategy:STRATEGY_ID:interval:INTERVAL_KEY"
```

**2. "Order placement failed: Invalid signature"**

**Cause:** API key/secret incorrect or not properly encrypted

**Solution:**
```typescript
// Test decryption
const decrypted = decrypt(broker.apiKey);
console.log('Decrypted key:', decrypted);

// Re-store credentials
await prisma.brokerCredential.update({
  where: { id: broker.id },
  data: {
    apiKey: encrypt(correctApiKey),
    apiSecret: encrypt(correctApiSecret)
  }
});
```

**3. "Backtest taking too long"**

**Cause:** Too many candles or complex strategy

**Solution:**
- Reduce date range
- Increase resolution (1h instead of 1m)
- Optimize strategy code
- Add timeout

**4. "Order monitor not detecting fills"**

**Cause:** Worker not running or Redis connection lost

**Solution:**
```bash
# Check worker status
pm2 status

# Check Redis connection
redis-cli ping

# Restart worker
pm2 restart order-monitor
```

**5. "Rate limit exceeded"**

**Cause:** Too many API calls to CoinDCX

**Solution:**
- Increase RATE_LIMIT_DELAY
- Reduce order monitoring frequency
- Use API call budget wisely

---

## Conclusion

This document provides a complete technical reference for the XcoinAlgo trading platform. It covers architecture, implementation details, design decisions, and operational procedures.

For further questions or clarifications, refer to:
- Source code comments
- API endpoint documentation
- Database schema
- Worker logs

---

**Document Version:** 2.0
**Last Updated:** January 2025
**Maintainer:** Development Team
