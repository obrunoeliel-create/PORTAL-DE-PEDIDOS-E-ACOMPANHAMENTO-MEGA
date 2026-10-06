import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { DrawError, campaignStateForStaff, drawTodayTable } from "@/lib/mesa-premiada";

export const runtime = "nodejs";

// Botão "Sortear agora": sorteia a Mesa Premiada do dia entre as mesas ocupadas.
// Se já houver sorteio hoje, devolve o mesmo (não sorteia de novo).
export async function POST() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  try {
    await drawTodayTable("MANUAL", auth.user.name);
    return NextResponse.json({ campaign: await campaignStateForStaff() });
  } catch (err) {
    if (err instanceof DrawError) return jsonError(err.message, 409);
    throw err;
  }
}
