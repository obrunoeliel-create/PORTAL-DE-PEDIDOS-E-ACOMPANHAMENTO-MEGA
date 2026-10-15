import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { pendingTableCalls } from "@/lib/table-calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chamados de mesa ainda não atendidos (para o aviso do portal).
export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ calls: await pendingTableCalls() });
}
