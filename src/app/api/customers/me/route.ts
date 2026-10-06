import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerUpdateSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { customerSelect, getCurrentCustomer, toProfile } from "@/lib/customer-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ customer: await getCurrentCustomer() }, { headers: { "Cache-Control": "no-store" } });
}

// Atualiza o endereço salvo (cliente escolheu "salvar este endereço no meu cadastro").
export async function PATCH(req: Request) {
  const me = await getCurrentCustomer();
  if (!me) return jsonError("Entre na sua conta para salvar o endereço.", 401);

  let body: unknown;
  try {
    body = await readJson(req, 2048);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = customerUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const a = parsed.data.address;

  let district = a.district;
  let zoneId: string | null = null;
  if (a.zoneId) {
    const zone = await prisma.deliveryZone.findFirst({ where: { id: a.zoneId, active: true } });
    if (zone) {
      district = zone.name;
      zoneId = zone.id;
    }
  }

  const c = await prisma.customer.update({
    where: { id: me.id },
    data: {
      addressStreet: a.street,
      addressNumber: a.number,
      addressDistrict: district,
      addressComplement: a.complement ?? null,
      addressReference: a.reference ?? null,
      zoneId,
    },
    select: customerSelect,
  });
  return NextResponse.json({ customer: toProfile(c) });
}
