-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "birthdayGiftYear" INTEGER,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "clubJoinedAt" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "lastPointsAt" TIMESTAMP(3),
ADD COLUMN     "lgpdAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "pointsBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsEarned12m" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsWarnedAt" TIMESTAMP(3),
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "tier" TEXT NOT NULL DEFAULT 'BRONZE',
ADD COLUMN     "tierSince" TIMESTAMP(3),
ADD COLUMN     "totalSavings" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ClubConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerReal" INTEGER NOT NULL DEFAULT 1,
    "pointsExpiryMonths" INTEGER NOT NULL DEFAULT 12,
    "welcomeBonus" INTEGER NOT NULL DEFAULT 50,
    "profileBonus" INTEGER NOT NULL DEFAULT 30,
    "birthdayBonus" INTEGER NOT NULL DEFAULT 100,
    "referralBonusReferrer" INTEGER NOT NULL DEFAULT 100,
    "referralBonusFriend" INTEGER NOT NULL DEFAULT 50,
    "ratingBonus" INTEGER NOT NULL DEFAULT 10,
    "redemptionValidDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubTier" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minPoints" INTEGER NOT NULL,
    "multiplier" INTEGER NOT NULL DEFAULT 100,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "benefits" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,

    CONSTRAINT "ClubTier_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PointsEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "orderId" TEXT,
    "refId" TEXT,
    "createdBy" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "pointsCost" INTEGER NOT NULL,
    "minTier" TEXT NOT NULL DEFAULT 'BRONZE',
    "emoji" TEXT NOT NULL DEFAULT '🎁',
    "stock" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "rewardName" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "usedWhere" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "weekdays" TEXT NOT NULL DEFAULT '0123456',
    "hourFrom" INTEGER NOT NULL DEFAULT 0,
    "hourTo" INTEGER NOT NULL DEFAULT 24,
    "minTier" TEXT NOT NULL DEFAULT 'BRONZE',
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🎯',
    "kind" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "weekday" INTEGER,
    "periodDays" INTEGER,
    "rewardPoints" INTEGER NOT NULL,
    "minTier" TEXT NOT NULL DEFAULT 'BRONZE',
    "repeatable" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionProgress" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "cycleStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PointsEntry_dedupeKey_key" ON "PointsEntry"("dedupeKey");

-- CreateIndex
CREATE INDEX "PointsEntry_customerId_createdAt_idx" ON "PointsEntry"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "PointsEntry_kind_createdAt_idx" ON "PointsEntry"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_code_key" ON "Redemption"("code");

-- CreateIndex
CREATE INDEX "Redemption_customerId_status_idx" ON "Redemption"("customerId", "status");

-- CreateIndex
CREATE INDEX "Redemption_status_expiresAt_idx" ON "Redemption"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MissionProgress_missionId_customerId_key" ON "MissionProgress"("missionId", "customerId");

-- CreateIndex
CREATE INDEX "ClubAudit_createdAt_idx" ON "ClubAudit"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");

-- CreateIndex
CREATE INDEX "Customer_tier_idx" ON "Customer"("tier");

-- CreateIndex
CREATE INDEX "Customer_lastOrderAt_idx" ON "Customer"("lastOrderAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------- Dados iniciais do Clube (tudo editável no portal) ----------
INSERT INTO "ClubConfig" ("id", "updatedAt") VALUES (1, NOW()) ON CONFLICT DO NOTHING;

INSERT INTO "ClubTier" ("key", "name", "minPoints", "multiplier", "color", "icon", "description", "benefits", "sort") VALUES
('BRONZE',   'Bronze',   0,    100, '#b8733d', '🥉', 'Bem-vindo ao clube! Cada pedido já vale pontos.', E'1 ponto a cada R$ 1,00\nPresente de aniversário\nMissões e recompensas', 1),
('PRATA',    'Prata',    500,  110, '#8f9aa6', '🥈', 'Cliente de casa: seus pontos rendem 10% a mais.', E'10% a mais de pontos em todo pedido\nRecompensas exclusivas Prata\nPresente de aniversário', 2),
('OURO',     'Ouro',     1500, 125, '#d4a017', '🥇', 'Cliente VIP: 25% a mais de pontos e campanhas exclusivas.', E'25% a mais de pontos em todo pedido\nCampanhas e pré-vendas exclusivas VIP\nRecompensas exclusivas Ouro\nPresente de aniversário especial', 3),
('DIAMANTE', 'Diamante', 4000, 150, '#4cc3d9', '💎', 'O topo do clube: 50% a mais de pontos e tratamento VIP.', E'50% a mais de pontos em todo pedido\nTodas as campanhas VIP\nRecompensas exclusivas Diamante\nAtendimento prioritário', 4)
ON CONFLICT DO NOTHING;

INSERT INTO "Reward" ("id", "name", "description", "kind", "value", "pointsCost", "minTier", "emoji", "sort") VALUES
('rw_refri',   'Refrigerante lata',        'Uma lata de refrigerante (350 ml) no seu próximo pedido.', 'PRODUCT',  600,  80,  'BRONZE', '🥤', 1),
('rw_esfihas', '5 esfihas tradicionais',   'Cinco esfihas tradicionais à sua escolha.',               'PRODUCT',  1750, 150, 'BRONZE', '🥟', 2),
('rw_vale10',  'Vale-compras R$ 10',       'R$ 10,00 de desconto em um pedido (no site ou na loja).', 'DISCOUNT', 1000, 150, 'BRONZE', '🎟️', 3),
('rw_vale25',  'Vale-compras R$ 25',       'R$ 25,00 de desconto em um pedido (no site ou na loja).', 'DISCOUNT', 2500, 350, 'PRATA',  '💳', 4),
('rw_pizza',   'Pizza grande tradicional', 'Uma pizza grande de sabor tradicional.',                  'PRODUCT',  5000, 500, 'BRONZE', '🍕', 5),
('rw_15off',   '15% de desconto VIP',      '15% de desconto em um pedido inteiro (itens).',           'PERCENT',  15,   300, 'OURO',   '👑', 6)
ON CONFLICT DO NOTHING;

INSERT INTO "Mission" ("id", "name", "description", "emoji", "kind", "target", "weekday", "periodDays", "rewardPoints", "repeatable", "sort") VALUES
('ms_fregues',  'Freguês da casa',       'Faça 3 pedidos em 30 dias.',                    '🏠', 'ORDERS',            3,     NULL, 30,   100, true,  1),
('ms_sabores',  'Explorador de sabores', 'Experimente 5 sabores diferentes.',             '🧭', 'DISTINCT_PRODUCTS', 5,     NULL, NULL, 80,  false, 2),
('ms_terca',    'Terça da Esfiha',       'Peça numa terça-feira e ganhe pontos extras.',  '📅', 'WEEKDAY',           1,     2,    NULL, 30,  true,  3),
('ms_pedidao',  'Pedidão',               'Faça um pedido acima de R$ 100,00.',            '💰', 'MIN_TICKET',        10000, NULL, NULL, 50,  true,  4),
('ms_amigos',   'Turma da Mega',         'Indique 3 amigos que façam o primeiro pedido.', '👯', 'REFERRALS',         3,     NULL, NULL, 150, false, 5)
ON CONFLICT DO NOTHING;
