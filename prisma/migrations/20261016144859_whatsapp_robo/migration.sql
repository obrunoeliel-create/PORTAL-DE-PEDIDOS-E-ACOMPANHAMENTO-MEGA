-- CreateEnum
CREATE TYPE "WaMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WaAuth" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "ratingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ratingDelayHours" INTEGER NOT NULL DEFAULT 24,
    "couponEnabled" BOOLEAN NOT NULL DEFAULT true,
    "couponDelayDays" INTEGER NOT NULL DEFAULT 7,
    "couponPercent" INTEGER NOT NULL DEFAULT 10,
    "couponValidityDays" INTEGER NOT NULL DEFAULT 15,
    "couponPrefix" TEXT NOT NULL DEFAULT 'VOLTE',
    "couponMinOrder" INTEGER NOT NULL DEFAULT 0,
    "deliveryEta" TEXT NOT NULL DEFAULT '40 a 60 minutos',
    "minIntervalSeconds" INTEGER NOT NULL DEFAULT 4,
    "maxPerHour" INTEGER NOT NULL DEFAULT 150,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "connectedPhone" TEXT,
    "connectedName" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaTemplate" (
    "key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "WaMessage" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "templateKey" TEXT,
    "vars" JSONB NOT NULL DEFAULT '{}',
    "phone" TEXT NOT NULL,
    "body" TEXT,
    "status" "WaMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "providerId" TEXT,
    "provider" TEXT,
    "orderId" TEXT,
    "campaignId" TEXT,
    "createdBy" TEXT,
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "WaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaContact" (
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "jid" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "optInAt" TIMESTAMP(3),
    "optOutAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "WaCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "inactiveDays" INTEGER,
    "couponCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),

    CONSTRAINT "WaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "minOrder" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "OrderRating" (
    "orderId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRating_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaMessage_dedupeKey_key" ON "WaMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "WaMessage_status_notBefore_idx" ON "WaMessage"("status", "notBefore");

-- CreateIndex
CREATE INDEX "WaMessage_phone_idx" ON "WaMessage"("phone");

-- CreateIndex
CREATE INDEX "WaMessage_createdAt_idx" ON "WaMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WaMessage_providerId_idx" ON "WaMessage"("providerId");

-- CreateIndex
CREATE INDEX "WaMessage_campaignId_idx" ON "WaMessage"("campaignId");

-- CreateIndex
CREATE INDEX "WaEvent_createdAt_idx" ON "WaEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "OrderRating" ADD CONSTRAINT "OrderRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Configuração inicial do robô
INSERT INTO "WaConfig" ("id", "updatedAt") VALUES (1, NOW()) ON CONFLICT DO NOTHING;
