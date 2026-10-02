import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { createDriverSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const driverSelect = { id: true, name: true, phone: true, active: true } as const;

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const drivers = await prisma.driver.findMany({ select: driverSelect, orderBy: { name: "asc" } });
  return NextResponse.json({ drivers });
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
  const parsed = createDriverSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const driver = await prisma.driver.create({ data: parsed.data, select: driverSelect });
  return NextResponse.json({ driver }, { status: 201 });
}
