-- CreateIndex
-- This index optimizes queries that filter by status + date range
-- Used by: /api/client/dashboard endpoint for fetching recent trades + open positions
CREATE INDEX "trades_status_createdAt_idx" ON "public"."trades"("status", "createdAt");

-- Rollback SQL (run manually if needed):
-- DROP INDEX IF EXISTS "public"."trades_status_createdAt_idx";
