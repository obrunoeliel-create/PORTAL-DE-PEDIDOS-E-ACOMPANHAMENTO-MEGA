// Cria as mesas 1..TABLE_COUNT (padrão 50) com token aleatório.
// Mesas que já existem NÃO são alteradas — os QR Codes impressos continuam valendo.
// Uso: npm run db:seed-tables   (ou TABLE_COUNT=60 npm run db:seed-tables)
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const count = Number.parseInt(process.env.TABLE_COUNT ?? "50", 10);
  if (!Number.isInteger(count) || count < 1 || count > 999) throw new Error("TABLE_COUNT deve estar entre 1 e 999");

  let created = 0;
  for (let number = 1; number <= count; number++) {
    const exists = await prisma.diningTable.findUnique({ where: { number } });
    if (exists) continue;
    await prisma.diningTable.create({ data: { number, token: randomBytes(18).toString("base64url") } });
    created++;
  }
  console.log(`Mesas: ${created} criada(s), ${count - created} já existia(m).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
