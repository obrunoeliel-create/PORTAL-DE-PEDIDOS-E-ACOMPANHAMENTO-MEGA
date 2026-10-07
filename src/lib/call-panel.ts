import "server-only";

/**
 * Integração com o Painel de Chamada de Senhas (a TV da loja).
 * Quando um pedido de RETIRADA NO BALCÃO fica pronto, o portal chama sozinho o número do pedido e o
 * primeiro nome do cliente no painel — o mesmo que digitar em /operador e clicar em CHAMAR.
 *
 *   CALL_PANEL_URL       endereço do painel, ex: https://painel-senhas-mega.onrender.com
 *   CALL_PANEL_USER      usuário da loja no painel
 *   CALL_PANEL_PASSWORD  senha desse usuário
 *   CALL_PANEL_PLACE     texto do local mostrado na TV (padrão "Balcão")
 *
 * Sem as três primeiras, nada é chamado (o operador segue usando a tela do painel na mão).
 */

const COOKIE_NAME = "painel_sessao";
// O painel pode estar "dormindo" na hospedagem e levar perto de um minuto para acordar.
const TIMEOUT_MS = 75_000;

let sessionCookie: string | null = null;

function config() {
  const url = (process.env.CALL_PANEL_URL ?? "").trim().replace(/\/+$/, "");
  const user = (process.env.CALL_PANEL_USER ?? "").trim();
  const password = process.env.CALL_PANEL_PASSWORD ?? "";
  if (!/^https?:\/\//i.test(url) || !user || !password) return null;
  return { url, user, password, place: (process.env.CALL_PANEL_PLACE ?? "Balcão").trim().slice(0, 30) };
}

export function callPanelConfigured(): boolean {
  return config() !== null;
}

async function login(cfg: NonNullable<ReturnType<typeof config>>): Promise<string> {
  const res = await fetch(`${cfg.url}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ usuario: cfg.user, senha: cfg.password }).toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith(`${COOKIE_NAME}=`) && c.length > COOKIE_NAME.length + 1);
  if (!cookie) throw new Error("usuário ou senha do painel recusados");
  return cookie;
}

async function postCall(cfg: NonNullable<ReturnType<typeof config>>, cookie: string, body: Record<string, string>) {
  return fetch(`${cfg.url}/api/chamar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Chama o pedido na TV. Nunca lança erro: se o painel estiver fora do ar, só registra no log
 * e a loja pode chamar na mão pela tela do operador.
 */
export async function callOrderOnPanel(order: { number: number; customerName: string }): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  // Só o primeiro nome, sem caracteres de controle.
  const firstName = (order.customerName.replace(/[\u0000-\u001f<>]/g, " ").trim().split(/\s+/)[0] ?? "").slice(0, 40);
  const body = { numero: String(order.number), nome: firstName, local: cfg.place };

  try {
    sessionCookie ??= await login(cfg);
    let res = await postCall(cfg, sessionCookie, body);
    if (res.status === 401) {
      // Sessão vencida (ou o painel reiniciou com outra chave): entra de novo e repete uma vez.
      sessionCookie = await login(cfg);
      res = await postCall(cfg, sessionCookie, body);
    }
    if (!res.ok) throw new Error(`painel respondeu HTTP ${res.status}`);
    return true;
  } catch (err) {
    sessionCookie = null;
    console.warn(`[painel-senhas] pedido #${order.number} não foi chamado: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
