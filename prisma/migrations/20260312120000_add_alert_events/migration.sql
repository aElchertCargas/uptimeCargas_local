CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "context" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "alertEventId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertEvent_incidentId_kind_key" ON "AlertEvent"("incidentId", "kind");
CREATE INDEX "AlertEvent_status_scheduledFor_idx" ON "AlertEvent"("status", "scheduledFor");
CREATE INDEX "AlertEvent_incidentId_createdAt_idx" ON "AlertEvent"("incidentId", "createdAt");

CREATE UNIQUE INDEX "AlertDelivery_alertEventId_channelId_key" ON "AlertDelivery"("alertEventId", "channelId");
CREATE INDEX "AlertDelivery_channelId_status_idx" ON "AlertDelivery"("channelId", "status");

ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_incidentId_fkey"
FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_alertEventId_fkey"
FOREIGN KEY ("alertEventId") REFERENCES "AlertEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
