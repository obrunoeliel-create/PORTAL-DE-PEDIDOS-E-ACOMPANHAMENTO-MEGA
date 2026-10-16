import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { cuidParam, updateProductSchema } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Item do cardápio: ativar/desativar (ex: acabou o ingrediente) — gerentes e operadores;
 * mudar preço (do item ou de cada tamanho) — só gerente. Pedidos já feitos guardam o preço da hora.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Produto não encontrado.", 404);

  let body: unknown;
  try {
    body = await readJson(req, 2048);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { active, price, variants } = parsed.data;

  if ((price !== undefined || variants !== undefined) && auth.user.role !== "MANAGER") {
    return jsonError("Só o gerente pode mudar preços.", 403);
  }

  const product = await prisma.product.findUnique({ where: { id: id.data }, select: { id: true, variants: { select: { id: true } } } });
  if (!product) return jsonError("Produto não encontrado.", 404);
  if (variants?.some((v) => !product.variants.some((pv) => pv.id === v.id))) {
    return jsonError("Tamanho não pertence a este produto.", 422);
  }

  const updated = await prisma.$transaction(async (tx) => {
    for (const v of variants ?? []) await tx.productVariant.update({ where: { id: v.id }, data: { price: v.price } });
    return tx.product.update({
      where: { id: id.data },
      data: { ...(active !== undefined && { active }), ...(price !== undefined && { price }) },
      select: {
        id: true,
        active: true,
        price: true,
        variants: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, price: true } },
      },
    });
  });
  return NextResponse.json({ product: updated, ...updated });
}
