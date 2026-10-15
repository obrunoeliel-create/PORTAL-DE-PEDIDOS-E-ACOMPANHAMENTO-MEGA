-- CreateTable
CREATE TABLE "TableCall" (
    "id" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendedAt" TIMESTAMP(3),
    "attendedBy" TEXT,

    CONSTRAINT "TableCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableCall_attendedAt_idx" ON "TableCall"("attendedAt");

-- CreateIndex
CREATE INDEX "TableCall_tableNumber_attendedAt_idx" ON "TableCall"("tableNumber", "attendedAt");

