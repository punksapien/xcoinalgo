-- CreateEnum
CREATE TYPE "public"."StrategyValidationStatus" AS ENUM ('PENDING', 'VALIDATING', 'VALID', 'INVALID', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "public"."StrategyComplexity" AS ENUM ('BEGINNER', 'MEDIUM', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "public"."BotStatus" AS ENUM ('STOPPED', 'DEPLOYING', 'STARTING', 'ACTIVE', 'UNHEALTHY', 'CRASHED', 'ERROR');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."broker_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerName" TEXT NOT NULL DEFAULT 'coindcx',
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."strategies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "detailedDescription" TEXT,
    "author" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "instrument" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '',
    "gitRepository" TEXT,
    "gitBranch" TEXT DEFAULT 'main',
    "gitCommitHash" TEXT,
    "gitPullRequestUrl" TEXT,
    "strategyPath" TEXT,
    "configPath" TEXT,
    "requirementsPath" TEXT,
    "backtestDataPath" TEXT,
    "validationStatus" "public"."StrategyValidationStatus" NOT NULL DEFAULT 'PENDING',
    "validationErrors" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "winRate" DOUBLE PRECISION,
    "riskReward" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "roi" DOUBLE PRECISION,
    "marginRequired" DOUBLE PRECISION,
    "marginCurrency" TEXT DEFAULT 'INR',
    "sharpeRatio" DOUBLE PRECISION,
    "totalTrades" INTEGER,
    "avgTradeReturn" DOUBLE PRECISION,
    "profitFactor" DOUBLE PRECISION,
    "supportedPairs" JSONB,
    "timeframes" JSONB,
    "strategyType" TEXT,
    "complexity" "public"."StrategyComplexity" NOT NULL DEFAULT 'MEDIUM',
    "supportsFutures" BOOLEAN NOT NULL DEFAULT false,
    "supportsSpot" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "deploymentCount" INTEGER NOT NULL DEFAULT 0,
    "totalPnl" DOUBLE PRECISION DEFAULT 0,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "avgUserRating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastDeployedAt" TIMESTAMP(3),
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isMarketplace" BOOLEAN NOT NULL DEFAULT false,
    "executionConfig" JSONB,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."strategy_versions" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changeLog" TEXT,
    "gitCommitHash" TEXT,
    "strategyCode" TEXT NOT NULL,
    "configData" JSONB,
    "requirements" TEXT,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "validationErrors" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."backtest_results" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "initialBalance" DOUBLE PRECISION NOT NULL,
    "timeframe" TEXT NOT NULL,
    "finalBalance" DOUBLE PRECISION NOT NULL,
    "totalReturn" DOUBLE PRECISION NOT NULL,
    "totalReturnPct" DOUBLE PRECISION NOT NULL,
    "maxDrawdown" DOUBLE PRECISION NOT NULL,
    "sharpeRatio" DOUBLE PRECISION NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "profitFactor" DOUBLE PRECISION NOT NULL,
    "totalTrades" INTEGER NOT NULL,
    "avgTrade" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION,
    "calmarRatio" DOUBLE PRECISION,
    "sortinoRatio" DOUBLE PRECISION,
    "maxDrawdownDuration" INTEGER,
    "equityCurve" JSONB NOT NULL,
    "tradeHistory" JSONB NOT NULL,
    "monthlyReturns" JSONB NOT NULL,
    "backtestDuration" DOUBLE PRECISION NOT NULL,
    "dataQuality" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."strategy_reviews" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bot_deployments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "executionInterval" INTEGER NOT NULL DEFAULT 300,
    "nextExecutionAt" TIMESTAMP(3),
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecutionDuration" DOUBLE PRECISION,
    "status" "public"."BotStatus" NOT NULL DEFAULT 'STOPPED',
    "leverage" INTEGER NOT NULL DEFAULT 10,
    "riskPerTrade" DOUBLE PRECISION NOT NULL DEFAULT 0.005,
    "marginCurrency" TEXT NOT NULL DEFAULT 'USDT',
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeat" TIMESTAMP(3),
    "restartCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "successfulExecutions" INTEGER NOT NULL DEFAULT 0,
    "failedExecutions" INTEGER NOT NULL DEFAULT 0,
    "avgExecutionTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."process_logs" (
    "id" TEXT NOT NULL,
    "botDeploymentId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."strategy_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "capital" DOUBLE PRECISION NOT NULL,
    "riskPerTrade" DOUBLE PRECISION NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "maxPositions" INTEGER NOT NULL DEFAULT 1,
    "maxDailyLoss" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "slAtrMultiplier" DOUBLE PRECISION,
    "tpAtrMultiplier" DOUBLE PRECISION,
    "tradingType" TEXT NOT NULL DEFAULT 'spot',
    "marginCurrency" TEXT NOT NULL DEFAULT 'USDT',
    "marginConversionRate" DOUBLE PRECISION,
    "positionMarginType" TEXT NOT NULL DEFAULT 'isolated',
    "brokerCredentialId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "winningTrades" INTEGER NOT NULL DEFAULT 0,
    "losingTrades" INTEGER NOT NULL DEFAULT 0,
    "totalPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."strategy_executions" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "intervalKey" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "symbol" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "closePrice" DOUBLE PRECISION,
    "signalType" TEXT,
    "confidence" DOUBLE PRECISION,
    "indicators" JSONB,
    "status" TEXT NOT NULL,
    "subscribersCount" INTEGER NOT NULL DEFAULT 0,
    "tradesGenerated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trades" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "executionId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "orderType" TEXT NOT NULL DEFAULT 'market',
    "orderId" TEXT,
    "positionId" TEXT,
    "leverage" INTEGER,
    "marginCurrency" TEXT,
    "liquidationPrice" DOUBLE PRECISION,
    "tradingType" TEXT NOT NULL DEFAULT 'spot',
    "status" TEXT NOT NULL,
    "filledQuantity" DOUBLE PRECISION,
    "filledPrice" DOUBLE PRECISION,
    "filledAt" TIMESTAMP(3),
    "exitPrice" DOUBLE PRECISION,
    "exitedAt" TIMESTAMP(3),
    "exitReason" TEXT,
    "pnl" DOUBLE PRECISION,
    "pnlPercentage" DOUBLE PRECISION,
    "pnlPct" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "signalConfidence" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "public"."api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "public"."api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "public"."api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "broker_credentials_userId_brokerName_key" ON "public"."broker_credentials"("userId", "brokerName");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_code_version_key" ON "public"."strategies"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_versions_strategyId_version_key" ON "public"."strategy_versions"("strategyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_reviews_strategyId_userId_key" ON "public"."strategy_reviews"("strategyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "bot_deployments_userId_strategyId_key" ON "public"."bot_deployments"("userId", "strategyId");

-- CreateIndex
CREATE INDEX "process_logs_botDeploymentId_idx" ON "public"."process_logs"("botDeploymentId");

-- CreateIndex
CREATE INDEX "strategy_subscriptions_strategyId_isActive_idx" ON "public"."strategy_subscriptions"("strategyId", "isActive");

-- CreateIndex
CREATE INDEX "strategy_subscriptions_userId_isActive_idx" ON "public"."strategy_subscriptions"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_subscriptions_userId_strategyId_key" ON "public"."strategy_subscriptions"("userId", "strategyId");

-- CreateIndex
CREATE INDEX "strategy_executions_strategyId_executedAt_idx" ON "public"."strategy_executions"("strategyId", "executedAt");

-- CreateIndex
CREATE INDEX "strategy_executions_intervalKey_idx" ON "public"."strategy_executions"("intervalKey");

-- CreateIndex
CREATE INDEX "trades_subscriptionId_createdAt_idx" ON "public"."trades"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "trades_symbol_createdAt_idx" ON "public"."trades"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "trades_status_idx" ON "public"."trades"("status");

-- CreateIndex
CREATE INDEX "trades_positionId_idx" ON "public"."trades"("positionId");

-- AddForeignKey
ALTER TABLE "public"."api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."broker_credentials" ADD CONSTRAINT "broker_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_versions" ADD CONSTRAINT "strategy_versions_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "public"."strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."backtest_results" ADD CONSTRAINT "backtest_results_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "public"."strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_reviews" ADD CONSTRAINT "strategy_reviews_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "public"."strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_reviews" ADD CONSTRAINT "strategy_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bot_deployments" ADD CONSTRAINT "bot_deployments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bot_deployments" ADD CONSTRAINT "bot_deployments_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "public"."strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_subscriptions" ADD CONSTRAINT "strategy_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_subscriptions" ADD CONSTRAINT "strategy_subscriptions_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "public"."strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_subscriptions" ADD CONSTRAINT "strategy_subscriptions_brokerCredentialId_fkey" FOREIGN KEY ("brokerCredentialId") REFERENCES "public"."broker_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_executions" ADD CONSTRAINT "strategy_executions_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "public"."strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trades" ADD CONSTRAINT "trades_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."strategy_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
