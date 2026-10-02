import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { deliveryZoneSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { findZoneByName, listZones, zoneSelect } from "@/lib/delivery-zones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ zones: await listZones() });
}

export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await readJson(req, 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = deliveryZoneSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  if (await findZoneByName(parsed.data.name)) return jsonError("Esse bairro já está cadastrado.", 409);

  const zone = await prisma.deliveryZone.create({ data: parsed.data, select: zoneSelect });
  return NextResponse.json({ zone }, { status: 201 });
}
