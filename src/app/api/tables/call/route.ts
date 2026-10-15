import { NextResponse } from "next/server";
import { z } from "zod";
import { PayloadError, getClientIp, jsonError, readJson, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTableToken } from "@/lib/tables";
import { createTableCall } from "@/lib/table-calls";

export const runtime = "nodejs";

const schema = z
  .object({
    tableNumber: z.number().int().min(1).max(999),
    tableToken: z.string().regex(/^[A-Za-z0-9_-]{24}$/),
    reason: z.enum(["ATENDIMENTO", "CONTA"]).default("ATENDIMENTO"),
  })
  .strict();

/**
 * Cliente na mesa aperta "Chamar atendente". Só vale com o QR Code da própria mesa (token secreto),
 * e há limite por aparelho e por mesa para ninguém ficar disparando avisos na loja.
 */
export async function POST(req: Request) {
  const ipLimit = rateLimit(`tablecall:ip:${getClientIp(req)}`, 10, 10 * 60_000);
  if (!ipLimit.ok) return tooManyRequests(ipLimit);

  let body: unknown;
  try {
    body = await readJson(req, 512);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("QR Code da mesa inválido.", 422);
  const { tableNumber, tableToken, reason } = parsed.data;
  if (!(await verifyTableToken(tableNumber, tableToken))) return jsonError("QR Code da mesa inválido. Leia de novo o QR Code da mesa.", 403);

  const tableLimit = rateLimit(`tablecall:table:${tableNumber}`, 6, 10 * 60_000);
  if (!tableLimit.ok) return jsonError("A equipe já foi avisada. Aguarde um instante, já vamos até a sua mesa.", 429);

  const result = await createTableCall(tableNumber, reason);
  return NextResponse.json({ ok: true, ...result });
}
