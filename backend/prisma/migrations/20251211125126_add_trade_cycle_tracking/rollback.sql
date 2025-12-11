-- ============================================
-- ROLLBACK SCRIPT: Trade Cycle Tracking Migration
-- ============================================
-- Migration: 20251211125126_add_trade_cycle_tracking
-- Created: 2025-12-11
--
-- WARNING: This script is DESTRUCTIVE!
-- It will permanently delete all trade cycle and trade order data.
-- Make sure to backup your data before running!
--
-- Usage:
--   psql $DATABASE_URL -f rollback.sql
--
-- Or via SSH:
--   psql "$DATABASE_URL" < rollback.sql
-- ============================================

-- Step 1: Drop foreign key constraints
ALTER TABLE "public"."trade_orders" DROP CONSTRAINT IF EXISTS "trade_orders_tradeId_fkey";
ALTER TABLE "public"."trade_orders" DROP CONSTRAINT IF EXISTS "trade_orders_cycleId_fkey";
ALTER TABLE "public"."trade_cycles" DROP CONSTRAINT IF EXISTS "trade_cycles_subscriptionId_fkey";

-- Step 2: Drop indexes
DROP INDEX IF EXISTS "public"."trade_orders_signalGeneratedAt_idx";
DROP INDEX IF EXISTS "public"."trade_orders_exchangeOrderId_idx";
DROP INDEX IF EXISTS "public"."trade_orders_clientOrderId_idx";
DROP INDEX IF EXISTS "public"."trade_orders_cycleId_idx";

DROP INDEX IF EXISTS "public"."trade_cycles_subscriptionId_cycleNumber_key";
DROP INDEX IF EXISTS "public"."trade_cycles_subscriptionId_openedAt_idx";
DROP INDEX IF EXISTS "public"."trade_cycles_openedAt_idx";
DROP INDEX IF EXISTS "public"."trade_cycles_subscriptionId_status_idx";

-- Step 3: Drop tables
DROP TABLE IF EXISTS "public"."trade_orders";
DROP TABLE IF EXISTS "public"."trade_cycles";

-- Confirmation
SELECT 'Rollback completed successfully. Trade cycle tracking tables have been removed.' AS message;
