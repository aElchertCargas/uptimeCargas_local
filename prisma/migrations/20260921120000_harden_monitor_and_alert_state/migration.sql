ALTER TABLE "Monitor" ADD COLUMN "normalizedUrl" TEXT;
ALTER TABLE "Monitor" ADD COLUMN "suppressedDownAt" TIMESTAMP(3);
ALTER TABLE "Monitor" ADD COLUMN "suppressedDownMessage" TEXT;

UPDATE "Monitor"
SET "normalizedUrl" = lower(regexp_replace(trim("url"), '/+$', ''));

ALTER TABLE "Monitor" ALTER COLUMN "normalizedUrl" SET NOT NULL;
CREATE UNIQUE INDEX "Monitor_normalizedUrl_key" ON "Monitor"("normalizedUrl");

ALTER TABLE "AlertEvent" ADD COLUMN "processingAt" TIMESTAMP(3);
CREATE INDEX "AlertEvent_status_processingAt_idx"
  ON "AlertEvent"("status", "processingAt");

CREATE UNIQUE INDEX "Incident_one_open_per_monitor"
  ON "Incident"("monitorId")
  WHERE "resolvedAt" IS NULL;
