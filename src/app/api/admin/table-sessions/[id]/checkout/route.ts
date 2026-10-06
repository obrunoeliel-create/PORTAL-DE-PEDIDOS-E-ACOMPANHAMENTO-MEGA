import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { cuidParam } from "@/lib/validators";
import { jsonError } from "@/lib/http";
import { TableSessionError, previewTableCheckout } from "@/lib/table-sessions";

export const runtime = "nodejs";

// Caixa abriu a conta da mesa para pagamento: checa se é a Mesa Premiada do dia e calcula o desconto.
// (Só para a equipe logada — o cliente nunca consulta isso.)
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Comanda não encontrada.", 404);

  try {
    return NextResponse.json(await previewTableCheckout(id.data, auth.user.name));
  } catch (err) {
    if (err instanceof TableSessionError) return jsonError(err.message, 409);
    throw err;
  }
}
