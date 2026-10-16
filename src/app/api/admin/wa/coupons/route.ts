import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cupons: gerais (criados aqui) e pessoais (gerados pelo robô no "volte sempre"). */
export async function GET(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const personal = new URL(req.url).searchParams.get("personal") === "1";
  const coupons = await prisma.coupon.findMany({
    where: personal ? { phone: { not: null } } : { phone: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const used = await prisma.order.groupBy({
    by: ["couponCode"],
    where: { couponCode: { in: coupons.map((c) => c.code) }, status: { not: "CANCELED" } },
    _sum: { discount: true, total: true },
  });
  const byCode = new Map(used.map((u) => [u.couponCode, u._sum]));
  return NextResponse.json({
    coupons: coupons.map((c) => ({ ...c, discountGiven: byCode.get(c.code)?.discount ?? 0, salesTotal: byCode.get(c.code)?.total ?? 0 })),
  });
}

const createSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, "Use letras, números e hífen (3 a 30)."),
    kind: z.enum(["PERCENT", "FIXED"]),
    value: z.number().int().min(1),
    minOrder: z.number().int().min(0).max(100_000).default(0),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
    maxUses: z.number().int().min(1).max(100_000),
  })
  .strict()
  .refine((d) => (d.kind === "PERCENT" ? d.value <= 50 : d.value <= 20_000), { message: "Desconto alto demais (máx. 50% ou R$ 200,00).", path: ["value"] });

export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 2048);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  // Vale até o fim do dia escolhido (horário de Brasília).
  const validUntil = new Date(`${d.validUntil}T23:59:59-03:00`);
  if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() < Date.now()) {
    return NextResponse.json({ error: "A validade precisa ser hoje ou depois.", fields: { validUntil: "Data no passado." } }, { status: 422 });
  }
  try {
    const coupon = await prisma.coupon.create({
      data: { code: d.code, kind: d.kind, value: d.value, minOrder: d.minOrder, validUntil, maxUses: d.maxUses, source: "MANUAL" },
    });
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Já existe um cupom com esse código.", fields: { code: "Código em uso." } }, { status: 409 });
    }
    throw err;
  }
}

const patchSchema = z.object({ code: z.string().max(40), active: z.boolean() }).strict();

/** Ativa ou desativa um cupom. */
export async function PATCH(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { count } = await prisma.coupon.updateMany({ where: { code: parsed.data.code }, data: { active: parsed.data.active } });
  if (!count) return jsonError("Cupom não encontrado.", 404);
  return NextResponse.json({ ok: true });
}
