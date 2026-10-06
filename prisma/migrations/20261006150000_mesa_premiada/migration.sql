-- AlterTable
ALTER TABLE "TableSession" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CampanhaNatal" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Mesa Premiada - Edição de Natal',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "weekdays" INTEGER[],
    "discount" INTEGER NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampanhaNatal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesaPremiada" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "tableSessionId" TEXT,
    "trigger" TEXT NOT NULL,
    "drawnBy" TEXT,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "awarded" BOOLEAN NOT NULL DEFAULT false,
    "originalTotal" INTEGER,
    "discountApplied" INTEGER,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "MesaPremiada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MesaPremiada_date_key" ON "MesaPremiada"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MesaPremiada_tableSessionId_key" ON "MesaPremiada"("tableSessionId");

-- AddForeignKey
ALTER TABLE "MesaPremiada" ADD CONSTRAINT "MesaPremiada_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Campanha de Natal 2026: 01/11 a 27/12, sextas (5), sábados (6) e domingos (0), R$ 50,00 de desconto
INSERT INTO "CampanhaNatal" ("id", "name", "active", "startDate", "endDate", "weekdays", "discount", "updatedAt")
VALUES (1, 'Mesa Premiada - Edição de Natal', true, DATE '2026-11-01', DATE '2026-12-27', ARRAY[5, 6, 0], 5000, now())
ON CONFLICT ("id") DO NOTHING;
