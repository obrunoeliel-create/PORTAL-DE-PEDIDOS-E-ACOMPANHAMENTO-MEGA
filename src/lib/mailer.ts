import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envio de e-mail pela conta Gmail da loja (SMTP do Google com "senha de app").
 *
 *   SMTP_USER       e-mail que envia, ex: megaesfihajuremaoficial@gmail.com
 *   SMTP_PASSWORD   senha de app do Google (16 letras), NÃO a senha normal da conta
 *   SMTP_HOST       padrão smtp.gmail.com
 *   SMTP_PORT       padrão 465 (SSL)
 *   MAIL_FROM_NAME  nome do remetente, padrão "Mega Esfiha Jurema"
 *
 * Sem SMTP_USER/SMTP_PASSWORD nada é enviado.
 */

export type MailResult = { ok: true } | { ok: false; error: string };

let transport: Transporter | null = null;

export function mailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT ?? 465);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD?.replace(/\s+/g, "") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    // Conteúdo só do sistema: nada de anexos ou endereços lidos de arquivos/URLs.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
}

export async function sendMail(msg: { to: string; subject: string; html: string; text: string }): Promise<MailResult> {
  if (!mailConfigured()) return { ok: false, error: "E-mail automático não configurado" };
  try {
    await getTransport().sendMail({
      from: { name: process.env.MAIL_FROM_NAME ?? "Mega Esfiha Jurema", address: process.env.SMTP_USER! },
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    return { ok: true };
  } catch (err) {
    transport = null;
    const m = err instanceof Error ? err.message : String(err);
    // Nunca devolve a senha; só o motivo resumido.
    return { ok: false, error: `E-mail: ${m}`.slice(0, 300) };
  }
}

/** Escapa texto digitado pelo cliente antes de colocar no HTML do e-mail. */
export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
