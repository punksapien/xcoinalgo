/*
  Migration: Make Subscription Settings Nullable (Strategy Default Support)

  Purpose: Allow NULL values in subscription settings to indicate "use strategy default"
  - NULL = use strategy.executionConfig default value
  - Non-NULL = user manually overridden value

  This enables:
  1. Strategy owners to update defaults for all subscribers using defaults
  2. Preserving manual overrides for users who customized settings
  3. Better separation between defaults and custom values
*/

-- Step 1: Make columns nullable (schema change)
ALTER TABLE "public"."strategy_subscriptions"
  ALTER COLUMN "riskPerTrade" DROP NOT NULL,
  ALTER COLUMN "leverage" DROP NOT NULL,
  ALTER COLUMN "leverage" DROP DEFAULT,
  ALTER COLUMN "maxPositions" DROP NOT NULL,
  ALTER COLUMN "maxPositions" DROP DEFAULT,
  ALTER COLUMN "maxDailyLoss" DROP NOT NULL,
  ALTER COLUMN "maxDailyLoss" DROP DEFAULT;

-- Step 2: Data migration - Set to NULL where values match strategy defaults
-- This is SAFE and NON-DESTRUCTIVE: only converts hardcoded defaults to NULL

-- Update riskPerTrade to NULL where it matches strategy default
UPDATE "public"."strategy_subscriptions" ss
SET "riskPerTrade" = NULL
FROM "public"."strategies" s
WHERE ss."strategyId" = s.id
  AND ss."riskPerTrade" IS NOT NULL
  AND s."executionConfig" IS NOT NULL
  AND ABS(ss."riskPerTrade" - CAST(s."executionConfig"->>'risk_per_trade' AS FLOAT)) < 0.001;

-- Update leverage to NULL where it matches strategy default
UPDATE "public"."strategy_subscriptions" ss
SET "leverage" = NULL
FROM "public"."strategies" s
WHERE ss."strategyId" = s.id
  AND ss."leverage" IS NOT NULL
  AND s."executionConfig" IS NOT NULL
  AND ss."leverage" = CAST(s."executionConfig"->>'leverage' AS INTEGER);

-- Update maxPositions to NULL where it matches strategy default or hardcoded default (1)
UPDATE "public"."strategy_subscriptions" ss
SET "maxPositions" = NULL
FROM "public"."strategies" s
WHERE ss."strategyId" = s.id
  AND ss."maxPositions" IS NOT NULL
  AND (
    (s."executionConfig" IS NOT NULL AND ss."maxPositions" = CAST(s."executionConfig"->>'max_positions' AS INTEGER))
    OR ss."maxPositions" = 1
  );

-- Update maxDailyLoss to NULL where it matches strategy default or hardcoded default (0.05)
UPDATE "public"."strategy_subscriptions" ss
SET "maxDailyLoss" = NULL
FROM "public"."strategies" s
WHERE ss."strategyId" = s.id
  AND ss."maxDailyLoss" IS NOT NULL
  AND (
    (s."executionConfig" IS NOT NULL AND ABS(ss."maxDailyLoss" - CAST(s."executionConfig"->>'max_daily_loss' AS FLOAT)) < 0.001)
    OR ABS(ss."maxDailyLoss" - 0.05) < 0.001
  );

-- Log migration results
DO $$
DECLARE
  total_subscriptions INTEGER;
  null_risk INTEGER;
  null_leverage INTEGER;
  null_positions INTEGER;
  null_daily_loss INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_subscriptions FROM "public"."strategy_subscriptions";
  SELECT COUNT(*) INTO null_risk FROM "public"."strategy_subscriptions" WHERE "riskPerTrade" IS NULL;
  SELECT COUNT(*) INTO null_leverage FROM "public"."strategy_subscriptions" WHERE "leverage" IS NULL;
  SELECT COUNT(*) INTO null_positions FROM "public"."strategy_subscriptions" WHERE "maxPositions" IS NULL;
  SELECT COUNT(*) INTO null_daily_loss FROM "public"."strategy_subscriptions" WHERE "maxDailyLoss" IS NULL;

  RAISE NOTICE 'Migration Complete:';
  RAISE NOTICE '  Total subscriptions: %', total_subscriptions;
  RAISE NOTICE '  Using strategy default riskPerTrade: %', null_risk;
  RAISE NOTICE '  Using strategy default leverage: %', null_leverage;
  RAISE NOTICE '  Using strategy default maxPositions: %', null_positions;
  RAISE NOTICE '  Using strategy default maxDailyLoss: %', null_daily_loss;
END $$;
