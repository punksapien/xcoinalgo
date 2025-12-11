-- CreateTable
CREATE TABLE "public"."trade_cycles" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "strategySignal" TEXT,
    "symbol" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "entryOrderIds" JSONB NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "totalQuantity" DOUBLE PRECISION NOT NULL,
    "exitOrderIds" JSONB,
    "exitPrice" DOUBLE PRECISION,
    "exitReason" TEXT,
    "grossPnl" DOUBLE PRECISION,
    "netPnl" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnlPercentage" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "holdingTime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trade_orders" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "tradeId" TEXT,
    "orderType" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "filledPrice" DOUBLE PRECISION,
    "filledQuantity" DOUBLE PRECISION,
    "exchangeOrderId" TEXT,
    "clientOrderId" TEXT,
    "status" TEXT NOT NULL,
    "statusMessage" TEXT,
    "signalGeneratedAt" TIMESTAMP(3) NOT NULL,
    "orderPlacedAt" TIMESTAMP(3),
    "orderFilledAt" TIMESTAMP(3),
    "expectedPrice" DOUBLE PRECISION,
    "slippage" DOUBLE PRECISION,
    "slippageAmount" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_cycles_subscriptionId_status_idx" ON "public"."trade_cycles"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "trade_cycles_openedAt_idx" ON "public"."trade_cycles"("openedAt");

-- CreateIndex
CREATE INDEX "trade_cycles_subscriptionId_openedAt_idx" ON "public"."trade_cycles"("subscriptionId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "trade_cycles_subscriptionId_cycleNumber_key" ON "public"."trade_cycles"("subscriptionId", "cycleNumber");

-- CreateIndex
CREATE INDEX "trade_orders_cycleId_idx" ON "public"."trade_orders"("cycleId");

-- CreateIndex
CREATE INDEX "trade_orders_clientOrderId_idx" ON "public"."trade_orders"("clientOrderId");

-- CreateIndex
CREATE INDEX "trade_orders_exchangeOrderId_idx" ON "public"."trade_orders"("exchangeOrderId");

-- CreateIndex
CREATE INDEX "trade_orders_signalGeneratedAt_idx" ON "public"."trade_orders"("signalGeneratedAt");

-- AddForeignKey
ALTER TABLE "public"."trade_cycles" ADD CONSTRAINT "trade_cycles_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."strategy_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trade_orders" ADD CONSTRAINT "trade_orders_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."trade_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trade_orders" ADD CONSTRAINT "trade_orders_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "public"."trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- ROLLBACK INSTRUCTIONS
-- ============================================
-- If you need to rollback this migration, run the following SQL commands:
--
-- Step 1: Drop foreign key constraints
-- ALTER TABLE "public"."trade_orders" DROP CONSTRAINT "trade_orders_tradeId_fkey";
-- ALTER TABLE "public"."trade_orders" DROP CONSTRAINT "trade_orders_cycleId_fkey";
-- ALTER TABLE "public"."trade_cycles" DROP CONSTRAINT "trade_cycles_subscriptionId_fkey";
--
-- Step 2: Drop tables (this will delete all data!)
-- DROP TABLE IF EXISTS "public"."trade_orders";
-- DROP TABLE IF EXISTS "public"."trade_cycles";
--
-- Note: This rollback is DESTRUCTIVE and will permanently delete all trade cycle data.
-- Make sure to backup your data before running these commands!
