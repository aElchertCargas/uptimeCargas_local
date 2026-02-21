-- CreateTable
CREATE TABLE "DebugLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "monitor" TEXT NOT NULL,
    "channel" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebugLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebugLog_createdAt_idx" ON "DebugLog"("createdAt");
