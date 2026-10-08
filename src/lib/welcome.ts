import "server-only";
import { prisma } from "./prisma";
import { sendWelcomeWhatsApp } from "./whatsapp-cloud";
import { escapeHtml, sendMail } from "./mailer";
import { configuredPublicUrl } from "./public-url";

/**
 * Boas-vindas do primeiro cadastro: WhatsApp (modelo aprovado pela Meta) e, se o cliente informou,
 * e-mail com os dados que ele cadastrou. Roda em segundo plano e nunca lança erro.
 * A senha (PIN) nunca vai em mensagem nenhuma.
 */
export async function sendCustomerWelcome(customerId: string): Promise<void> {
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) return;
    const firstName = c.name.split(" ")[0] || c.name;
    const errors: string[] = [];
    const data: { welcomeWaAt?: Date; welcomeEmailAt?: Date; welcomeError?: string | null } = {};

    const wa = await sendWelcomeWhatsApp({ phone: c.phone, customerName: c.name });
    if (wa.ok) data.welcomeWaAt = new Date();
    else errors.push(`WhatsApp: ${wa.error}`);

    if (c.email) {
      const mail = await sendMail({ to: c.email, ...welcomeEmail(c, firstName) });
      if (mail.ok) data.welcomeEmailAt = new Date();
      else errors.push(mail.error);
    }

    data.welcomeError = errors.length ? errors.join(" | ").slice(0, 500) : null;
    if (errors.length) console.warn(`[boas-vindas] cliente ${c.id}: ${data.welcomeError}`);
    await prisma.customer.update({ where: { id: c.id }, data });
  } catch (err) {
    console.error("[boas-vindas] falha inesperada:", err instanceof Error ? err.message : err);
  }
}

const formatPhone = (d: string) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d);

function welcomeEmail(
  c: {
    name: string;
    phone: string;
    email: string | null;
    addressStreet: string | null;
    addressNumber: string | null;
    addressDistrict: string | null;
    addressComplement: string | null;
    addressReference: string | null;
    createdAt: Date;
  },
  firstName: string,
) {
  const site = configuredPublicUrl() || "https://megaesfihajurema.com";
  const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" }).format(c.createdAt);
  const address = c.addressStreet
    ? [`${c.addressStreet}, ${c.addressNumber ?? "s/n"}`, c.addressComplement, c.addressDistrict, c.addressReference && `Ref.: ${c.addressReference}`].filter(Boolean).join(" · ")
    : "Não informado";
  const rows: [string, string][] = [
    ["Nome", c.name],
    ["WhatsApp", formatPhone(c.phone)],
    ["E-mail", c.email ?? ""],
    ["Endereço", address],
    ["Cadastro feito em", when],
  ];

  const text = [
    `Olá, ${firstName}! Seja bem-vindo(a) à Mega Esfiha Jurema.`,
    "",
    "Seu cadastro foi feito com sucesso. Confira os dados que você informou:",
    ...rows.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "Sua senha de 4 números não aparece aqui por segurança. Guarde-a para entrar nos próximos pedidos.",
    "Se não foi você quem fez este cadastro, responda este e-mail.",
    "",
    `Peça quando quiser: ${site}`,
    "Obrigado pela preferência!",
    "Mega Esfiha Jurema",
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#16110f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#d3151b;padding:24px;text-align:center">
<img src="${e(site)}/brand/logo-240.jpg" width="88" height="88" alt="Mega Esfiha Jurema" style="border-radius:20px;border:3px solid #ffdc0a">
<h1 style="margin:12px 0 0;color:#ffffff;font-size:22px">Bem-vindo(a), ${e(firstName)}!</h1>
</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:16px">Seu cadastro na <strong>Mega Esfiha Jurema</strong> foi feito com sucesso. Muito obrigado pela confiança!</p>
<p style="margin:0 0 8px;font-size:15px">Confira os dados que você informou:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:12px;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #eee;color:#78716c;width:38%">${e(k)}</td><td style="padding:10px 12px;border-bottom:1px solid #eee"><strong>${e(v)}</strong></td></tr>`).join("")}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#78716c">Sua senha de 4 números não aparece aqui por segurança. Guarde-a para entrar nos próximos pedidos. Se não foi você quem fez este cadastro, responda este e-mail.</p>
<p style="text-align:center;margin:24px 0 8px"><a href="${e(site)}" style="display:inline-block;background:#d3151b;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:12px">Fazer um pedido</a></p>
</td></tr>
<tr><td style="background:#16110f;color:#ffdc0a;text-align:center;padding:14px;font-size:13px">Mega Esfiha Jurema · Guarulhos</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: `Cadastro confirmado — bem-vindo(a) à Mega Esfiha Jurema, ${firstName}!`, html, text };
}
