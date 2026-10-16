import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Auditoria do clube: ajustes de pontos, baixas e cancelamentos de resgates, mudanças de regras. */
export async function GET() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const rows = await prisma.clubAudit.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ audit: rows });
}
