import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { TEMPLATES, TEMPLATE_MAP, TEMPLATE_VARS, type TemplateKey } from "@/lib/wa/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mensagens automáticas: texto atual (editado no portal ou o padrão) e se está ligada. */
export async function GET() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const rows = await prisma.waTemplate.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return NextResponse.json({
    vars: TEMPLATE_VARS,
    templates: TEMPLATES.map((t) => {
      const r = byKey.get(t.key);
      return {
        key: t.key,
        name: t.name,
        when: t.when,
        defaultBody: t.body,
        body: r?.body ?? t.body,
        active: r?.active ?? true,
        updatedBy: r?.updatedBy ?? null,
        updatedAt: r?.updatedAt ?? null,
      };
    }),
  });
}

const keys = TEMPLATES.map((t) => t.key) as [TemplateKey, ...TemplateKey[]];
const patchSchema = z
  .object({
    key: z.enum(keys),
    body: z.string().trim().min(5, "Mensagem muito curta.").max(1500, "Máximo de 1500 caracteres.").optional(),
    active: z.boolean().optional(),
    reset: z.boolean().optional(),
  })
  .strict();

/** Salva o texto, liga/desliga a mensagem ou volta ao texto padrão (reset). */
export async function PATCH(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readJson(req, 8 * 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const { key, reset } = parsed.data;
  const def = TEMPLATE_MAP[key];
  const current = await prisma.waTemplate.findUnique({ where: { key } });
  const newBody = reset ? def.body : (parsed.data.body ?? current?.body ?? def.body);
  const active = parsed.data.active ?? current?.active ?? true;
  await prisma.waTemplate.upsert({
    where: { key },
    create: { key, body: newBody, active, updatedBy: auth.user.name },
    update: { body: newBody, active, updatedBy: auth.user.name },
  });
  return NextResponse.json({ ok: true, body: newBody, active });
}
