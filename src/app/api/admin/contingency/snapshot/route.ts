import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { buildSnapshot } from "@/lib/contingency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cópia de segurança para o modo contingência (só equipe logada). O portal baixa a cada 30 segundos.
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await buildSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
