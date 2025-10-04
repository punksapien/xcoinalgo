-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "broker_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brokerName" TEXT NOT NULL DEFAULT 'coindcx',
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "broker_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '',
    "winRate" REAL,
    "riskReward" REAL,
    "maxDrawdown" REAL,
    "roi" REAL,
    "marginRequired" REAL,
    "scriptPath" TEXT NOT NULL,
    "configPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deploymentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bot_deployments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "processId" TEXT,
    "pm2ProcessName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'STOPPED',
    "leverage" INTEGER NOT NULL DEFAULT 10,
    "riskPerTrade" REAL NOT NULL DEFAULT 0.005,
    "marginCurrency" TEXT NOT NULL DEFAULT 'USDT',
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeat" DATETIME,
    "restartCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "stoppedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bot_deployments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bot_deployments_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "process_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botDeploymentId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "broker_credentials_userId_brokerName_key" ON "broker_credentials"("userId", "brokerName");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_code_key" ON "strategies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bot_deployments_userId_strategyId_key" ON "bot_deployments"("userId", "strategyId");

-- CreateIndex
CREATE INDEX "process_logs_botDeploymentId_idx" ON "process_logs"("botDeploymentId");
