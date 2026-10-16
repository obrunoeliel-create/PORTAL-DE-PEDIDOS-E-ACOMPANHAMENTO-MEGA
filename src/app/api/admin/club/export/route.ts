import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Evita fórmula maliciosa ao abrir no Excel (=, +, -, @ no começo da célula).
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Exporta os sócios do clube em CSV (abre no Excel). Só gerente; o download fica na auditoria. */
export async function GET() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const rows = await prisma.customer.findMany({
    where: { clubJoinedAt: { not: null } },
    orderBy: { pointsEarned12m: "desc" },
    select: { name: true, phone: true, email: true, city: true, birthDate: true, tier: true, pointsBalance: true, pointsEarned12m: true, totalSavings: true, lastOrderAt: true, clubJoinedAt: true, marketingOptIn: true, referralCode: true },
  });
  await prisma.clubAudit.create({ data: { action: "EXPORT", detail: `${rows.length} sócios exportados`, actor: auth.user.name } });
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
  const lines = [
    ["Nome", "WhatsApp", "E-mail", "Cidade", "Aniversário", "Nível", "Saldo de pontos", "Pontos 12 meses", "Economia (R$)", "Último pedido", "Sócio desde", "Aceita promoções", "Código de indicação"].map(cell).join(";"),
    ...rows.map((r) =>
      [r.name, r.phone, r.email, r.city, d(r.birthDate), r.tier, r.pointsBalance, r.pointsEarned12m, (r.totalSavings / 100).toFixed(2).replace(".", ","), d(r.lastOrderAt), d(r.clubJoinedAt), r.marketingOptIn ? "sim" : "não", r.referralCode]
        .map(cell)
        .join(";"),
    ),
  ];
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clube-mega-jurema-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
