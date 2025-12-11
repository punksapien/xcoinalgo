-- CreateTable
-- Used for storing system-wide configuration values (e.g., USDT_INR_RATE)
CREATE TABLE "public"."system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- Rollback SQL (run manually if needed):
-- DROP TABLE IF EXISTS "public"."system_config";
