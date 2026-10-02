import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { cuidParam, deliveryZoneUpdateSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { findZoneByName, zoneSelect } from "@/lib/delivery-zones";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Bairro não encontrado.", 404);

  let body: unknown;
  try {
    body = await readJson(req, 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = deliveryZoneUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  if (parsed.data.name) {
    const same = await findZoneByName(parsed.data.name);
    if (same && same.id !== id.data) return jsonError("Já existe outro bairro com esse nome.", 409);
  }

  const { count } = await prisma.deliveryZone.updateMany({ where: { id: id.data }, data: parsed.data });
  if (count === 0) return jsonError("Bairro não encontrado.", 404);
  const zone = await prisma.deliveryZone.findUniqueOrThrow({ where: { id: id.data }, select: zoneSelect });
  return NextResponse.json({ zone });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Bairro não encontrado.", 404);

  // Pedidos guardam o nome do bairro e a taxa como cópia, então apagar não afeta o histórico.
  const { count } = await prisma.deliveryZone.deleteMany({ where: { id: id.data } });
  if (count === 0) return jsonError("Bairro não encontrado.", 404);
  return NextResponse.json({ ok: true });
}
