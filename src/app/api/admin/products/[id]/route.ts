import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { cuidParam, toggleProductSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";

export const runtime = "nodejs";

// Ativar/desativar item (ex: acabou o ingrediente). Gerentes e operadores podem.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Produto não encontrado.", 404);

  let body: unknown;
  try {
    body = await readJson(req, 256);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = toggleProductSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { count } = await prisma.product.updateMany({ where: { id: id.data }, data: { active: parsed.data.active } });
  if (count === 0) return jsonError("Produto não encontrado.", 404);
  return NextResponse.json({ id: id.data, active: parsed.data.active });
}
