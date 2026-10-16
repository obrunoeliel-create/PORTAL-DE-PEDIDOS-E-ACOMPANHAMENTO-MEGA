import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { ENTITIES, entityData, type Entity } from "@/lib/club/admin-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isEntity = (e: string): e is Entity => e in ENTITIES;

/** Lista recompensas, missões ou campanhas de pontos (com números de uso). */
export async function GET(_req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const { entity } = await params;
  if (!isEntity(entity)) return jsonError("Não encontrado.", 404);
  if (entity === "rewards") {
    const [items, counts] = await Promise.all([
      prisma.reward.findMany({ orderBy: [{ sort: "asc" }, { pointsCost: "asc" }] }),
      prisma.redemption.groupBy({ by: ["rewardId", "status"], _count: { _all: true } }),
    ]);
    return NextResponse.json({
      items: items.map((r) => ({
        ...r,
        issued: counts.filter((c) => c.rewardId === r.id).reduce((s, c) => s + c._count._all, 0),
        used: counts.find((c) => c.rewardId === r.id && c.status === "USED")?._count._all ?? 0,
      })),
    });
  }
  if (entity === "missions") {
    const [items, done] = await Promise.all([
      prisma.mission.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
      prisma.missionProgress.groupBy({ by: ["missionId"], where: { completions: { gt: 0 } }, _count: { _all: true }, _sum: { completions: true } }),
    ]);
    return NextResponse.json({ items: items.map((m) => ({ ...m, people: done.find((d) => d.missionId === m.id)?._count._all ?? 0, completions: done.find((d) => d.missionId === m.id)?._sum.completions ?? 0 })) });
  }
  return NextResponse.json({ items: await prisma.pointsCampaign.findMany({ orderBy: { startsAt: "desc" }, take: 100 }) });
}

export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const { entity } = await params;
  if (!isEntity(entity)) return jsonError("Não encontrado.", 404);
  let body: unknown;
  try {
    body = await readJson(req, 8 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = ENTITIES[entity].create.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const data = entityData(entity, parsed.data);
  const item =
    entity === "rewards"
      ? await prisma.reward.create({ data: data as never })
      : entity === "missions"
        ? await prisma.mission.create({ data: data as never })
        : await prisma.pointsCampaign.create({ data: data as never });
  await prisma.clubAudit.create({ data: { action: `CREATE_${entity.toUpperCase()}`, detail: (item as { name: string }).name, actor: auth.user.name } });
  return NextResponse.json({ item }, { status: 201 });
}
