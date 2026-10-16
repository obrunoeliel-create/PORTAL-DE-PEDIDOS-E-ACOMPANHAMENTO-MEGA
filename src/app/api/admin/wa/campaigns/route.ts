import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { campaignAudience } from "@/lib/wa/automations";
import { normalizeCode } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Campanhas com o resultado de cada uma e o tamanho de cada público. */
export async function GET() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const [campaigns, all, inactive, vip] = await Promise.all([
    prisma.waCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    campaignAudience("OPTIN_ALL"),
    campaignAudience("INACTIVE", 30),
    campaignAudience("VIP"),
  ]);
  const ids = campaigns.map((c) => c.id);
  const counts = ids.length
    ? await prisma.waMessage.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: ids } }, _count: { _all: true } })
    : [];
  return NextResponse.json({
    audiences: { OPTIN_ALL: all.length, INACTIVE: inactive.length, VIP: vip.length },
    campaigns: campaigns.map((c) => {
      const mine = counts.filter((x) => x.campaignId === c.id);
      const n = (s: string[]) => mine.filter((x) => s.includes(x.status)).reduce((sum, x) => sum + x._count._all, 0);
      return {
        ...c,
        result: {
          queued: n(["QUEUED", "SENDING"]),
          sent: n(["SENT", "DELIVERED", "READ"]),
          delivered: n(["DELIVERED", "READ"]),
          read: n(["READ"]),
          failed: n(["FAILED"]),
          skipped: n(["CANCELED"]),
        },
      };
    }),
  });
}

const createSchema = z
  .object({
    name: z.string().trim().min(2, "Dê um nome à campanha.").max(60),
    body: z.string().trim().min(10, "Mensagem muito curta.").max(1500, "Máximo de 1500 caracteres."),
    audience: z.enum(["OPTIN_ALL", "INACTIVE", "VIP"]),
    inactiveDays: z.number().int().min(7).max(365).optional(),
    couponCode: z.string().max(40).optional(),
  })
  .strict();

/** Cria a campanha como rascunho (o envio é um passo separado, com confirmação). */
export async function POST(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 8 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  let couponCode: string | null = null;
  if (d.couponCode?.trim()) {
    couponCode = normalizeCode(d.couponCode);
    const c = await prisma.coupon.findUnique({ where: { code: couponCode } });
    if (!c || !c.active || c.validUntil.getTime() < Date.now()) {
      return NextResponse.json({ error: "Cupom não encontrado, desativado ou vencido.", fields: { couponCode: "Crie o cupom na aba Cupons primeiro." } }, { status: 422 });
    }
    if (c.phone) return NextResponse.json({ error: "Este cupom é pessoal; para campanha, use um cupom geral.", fields: { couponCode: "Use um cupom geral." } }, { status: 422 });
  }
  const campaign = await prisma.waCampaign.create({
    data: {
      name: d.name,
      body: d.body,
      audience: d.audience,
      inactiveDays: d.audience === "INACTIVE" ? (d.inactiveDays ?? 30) : null,
      couponCode,
      createdBy: auth.user.name,
    },
  });
  return NextResponse.json({ campaign }, { status: 201 });
}
