-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN "sslExpiresAt" TIMESTAMP(3);
ALTER TABLE "Monitor" ADD COLUMN "sslIssuer" TEXT;
ALTER TABLE "Monitor" ADD COLUMN "sslLastCheckedAt" TIMESTAMP(3);
