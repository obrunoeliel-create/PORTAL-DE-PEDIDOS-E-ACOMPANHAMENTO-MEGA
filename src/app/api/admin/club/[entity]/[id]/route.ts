import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { ENTITIES, entityData, type Entity } from "@/lib/club/admin-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isEntity = (e: string): e is Entity => e in ENTITIES;
const validId = (id: string) => /^[a-z0-9_]{3,40}$/i.test(id);

export async function PATCH(req: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const { entity, id } = await params;
  if (!isEntity(entity) || !validId(id)) return jsonError("Não encontrado.", 404);
  let body: unknown;
  try {
    body = await readJson(req, 8 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = ENTITIES[entity].update.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const data = entityData(entity, parsed.data);
  try {
    const item =
      entity === "rewards"
        ? await prisma.reward.update({ where: { id }, data: data as never })
        : entity === "missions"
          ? await prisma.mission.update({ where: { id }, data: data as never })
          : await prisma.pointsCampaign.update({ where: { id }, data: data as never });
    await prisma.clubAudit.create({ data: { action: `UPDATE_${entity.toUpperCase()}`, detail: `${(item as { name: string }).name}: ${Object.keys(parsed.data).join(", ")}`, actor: auth.user.name } });
    return NextResponse.json({ item });
  } catch {
    return jsonError("Não encontrado.", 404);
  }
}

/** Excluir: recompensa já resgatada e missão já cumprida só podem ser desativadas (histórico). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const { entity, id } = await params;
  if (!isEntity(entity) || !validId(id)) return jsonError("Não encontrado.", 404);
  if (entity === "rewards" && (await prisma.redemption.count({ where: { rewardId: id } }))) {
    return jsonError("Esta recompensa já foi resgatada por clientes. Desative em vez de excluir.", 409);
  }
  if (entity === "missions" && (await prisma.missionProgress.count({ where: { missionId: id, completions: { gt: 0 } } }))) {
    return jsonError("Esta missão já foi cumprida por clientes. Desative em vez de excluir.", 409);
  }
  const { count } =
    entity === "rewards"
      ? await prisma.reward.deleteMany({ where: { id } })
      : entity === "missions"
        ? await prisma.mission.deleteMany({ where: { id } })
        : await prisma.pointsCampaign.deleteMany({ where: { id } });
  if (!count) return jsonError("Não encontrado.", 404);
  await prisma.clubAudit.create({ data: { action: `DELETE_${entity.toUpperCase()}`, detail: id, actor: auth.user.name } });
  return NextResponse.json({ ok: true });
}
