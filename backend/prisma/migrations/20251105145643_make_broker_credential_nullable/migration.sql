-- DropForeignKey
ALTER TABLE "public"."strategy_subscriptions" DROP CONSTRAINT "strategy_subscriptions_brokerCredentialId_fkey";

-- AlterTable
ALTER TABLE "public"."strategy_subscriptions" ALTER COLUMN "brokerCredentialId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."strategy_subscriptions" ADD CONSTRAINT "strategy_subscriptions_brokerCredentialId_fkey" FOREIGN KEY ("brokerCredentialId") REFERENCES "public"."broker_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
