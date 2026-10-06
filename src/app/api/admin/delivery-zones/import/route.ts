import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { deliveryZoneImportSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { listZones, parseZoneList } from "@/lib/delivery-zones";

export const runtime = "nodejs";

// Importação em lote: cria bairros novos e atualiza a taxa dos que já existem (pelo nome).
export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await readJson(req, 24 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = deliveryZoneImportSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { zones, invalid } = parseZoneList(parsed.data.text);
  if (zones.length === 0) return jsonError("Nenhuma linha válida. Use o formato: Bairro;7,00", 422);
  if (zones.length > 500) return jsonError("Máximo de 500 bairros por importação.", 422);

  let created = 0;
  let updated = 0;
  // Tudo ou nada: uma lista com erro não deixa metade importada. Tempo maior que o padrão (5s)
  // porque listas longas fazem muitas idas ao banco.
  await prisma.$transaction(
    async (tx) => {
      for (const z of zones) {
        const existing = await tx.deliveryZone.findFirst({ where: { name: { equals: z.name, mode: "insensitive" } } });
        if (existing) {
          await tx.deliveryZone.update({ where: { id: existing.id }, data: { fee: z.fee, active: true } });
          updated++;
        } else {
          await tx.deliveryZone.create({ data: z });
          created++;
        }
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  return NextResponse.json({ created, updated, invalid, zones: await listZones() });
}
