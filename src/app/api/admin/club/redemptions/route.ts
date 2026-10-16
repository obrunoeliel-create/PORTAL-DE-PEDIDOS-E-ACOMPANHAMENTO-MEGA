import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { ClubError, cancelRedemption, markRedemptionUsed } from "@/lib/club/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "MJ-ABCD-EFGH", "mjabcdefgh", "ABCD EFGH" → "MJ-ABCD-EFGH". */
function normalize(raw: string) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^MJ/, "");
  return s.length === 8 ? `MJ-${s.slice(0, 4)}-${s.slice(4)}` : null;
}

/** Caixa: consulta um resgate pelo código (ou leitura do QR Code). Qualquer funcionário. */
export async function GET(req: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  if (sp.get("recent") === "1") {
    const list = await prisma.redemption.findMany({
      where: { status: "USED" },
      orderBy: { usedAt: "desc" },
      take: 30,
      include: { customer: { select: { name: true } } },
    });
    return NextResponse.json({ recent: list.map((r) => ({ code: r.code, rewardName: r.rewardName, customer: r.customer.name, usedAt: r.usedAt, usedBy: r.usedBy, usedWhere: r.usedWhere })) });
  }
  const code = normalize(sp.get("code") ?? "");
  if (!code) return jsonError("Código inválido. Ex: MJ-ABCD-1234", 422);
  const r = await prisma.redemption.findUnique({ where: { code }, include: { customer: { select: { name: true, phone: true, tier: true } }, reward: { select: { kind: true, emoji: true, description: true } } } });
  if (!r) return jsonError("Resgate não encontrado.", 404);
  const expired = r.status === "ISSUED" && r.expiresAt < new Date();
  return NextResponse.json({
    redemption: {
      code: r.code,
      rewardName: r.rewardName,
      emoji: r.reward.emoji,
      kind: r.reward.kind,
      description: r.reward.description,
      value: r.value,
      status: expired ? "EXPIRED" : r.status,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
      usedBy: r.usedBy,
      usedWhere: r.usedWhere,
      customer: { name: r.customer.name, phoneEnd: r.customer.phone.slice(-4), tier: r.customer.tier },
    },
  });
}

const schema = z.object({ code: z.string().max(20), action: z.enum(["use", "cancel"]), where: z.string().trim().max(40).optional() }).strict();

/** Dar baixa no resgate (uma única vez) — registra quem, quando e onde. Cancelar: só gerente. */
export async function POST(req: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 512);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const code = normalize(parsed.data.code);
  if (!code) return jsonError("Código inválido.", 422);

  if (parsed.data.action === "cancel") {
    if (auth.user.role !== "MANAGER") return jsonError("Só o gerente pode cancelar um resgate.", 403);
    try {
      await cancelRedemption(code, auth.user.name);
      await prisma.clubAudit.create({ data: { action: "CANCEL_REDEMPTION", detail: `${code} (pontos devolvidos)`, actor: auth.user.name } });
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof ClubError) return jsonError(err.message, 409);
      throw err;
    }
  }

  const red = await markRedemptionUsed(code, auth.user.name, parsed.data.where || "Caixa");
  if (!red) {
    const r = await prisma.redemption.findUnique({ where: { code } });
    const why = !r ? "Resgate não encontrado." : r.status === "USED" ? `Este resgate JÁ FOI USADO em ${r.usedAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (${r.usedBy ?? "—"}).` : r.status === "CANCELED" ? "Este resgate foi cancelado." : "Este resgate está vencido.";
    return jsonError(why, 409);
  }
  await prisma.clubAudit.create({ data: { action: "USE_REDEMPTION", detail: `${code} — ${red.rewardName} (${parsed.data.where || "Caixa"})`, actor: auth.user.name } });
  return NextResponse.json({ ok: true, rewardName: red.rewardName });
}
