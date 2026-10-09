import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { mailConfigured, sendMail } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Teste do envio de e-mail (só gerente): manda uma mensagem de teste para o PRÓPRIO e-mail da loja
 * (SMTP_USER) e devolve se o servidor de e-mail aceitou ou qual erro deu. Nunca devolve a senha.
 */
export async function POST() {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  const user = process.env.SMTP_USER ?? "";
  const config = {
    userPresent: !!user,
    user: user ? user.replace(/^(.{3}).*(@.*)$/, "$1***$2") : null,
    passwordPresent: !!process.env.SMTP_PASSWORD,
    passwordLength: (process.env.SMTP_PASSWORD ?? "").replace(/\s+/g, "").length,
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
  };
  if (!mailConfigured()) return NextResponse.json({ config, ok: false, error: "SMTP_USER ou SMTP_PASSWORD não configurado no servidor." });

  const started = Date.now();
  const result = await sendMail({
    to: user,
    subject: "Teste de e-mail do portal — Mega Esfiha Jurema",
    text: "Se você recebeu esta mensagem, o envio de e-mails do portal está funcionando.",
    html: "<p>Se você recebeu esta mensagem, o envio de e-mails do portal está <strong>funcionando</strong>.</p>",
  });
  return NextResponse.json({ config, ...result, ms: Date.now() - started });
}
