import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { WASocket } from "@whiskeysockets/baileys";
import { prisma } from "../prisma";
import { emitToStaff } from "../socket-server";
import { clearAuthState, useDbAuthState } from "./auth-state";

/**
 * Robô do WhatsApp da loja: o número conectado pelo QR Code (como o WhatsApp Web) envia sozinho as
 * mensagens aos clientes. Roda dentro do próprio servidor do portal (um único processo).
 *
 * - Sessão guardada no banco (cifrada): volta sozinho após reinícios, sem novo QR Code.
 * - "Aluguel" no banco (leaseOwner/leaseUntil): durante uma publicação, o servidor antigo e o novo
 *   ficam no ar juntos por alguns segundos; só um deles conecta, evitando derrubar a sessão.
 * - QR Code só é gerado quando alguém pede na tela "WhatsApp" do portal, e expira em ~2 minutos.
 */

export type RobotStatus = "OFF" | "CONNECTING" | "QR" | "CONNECTED" | "WAITING_LEASE";

type RobotState = {
  instanceId: string;
  sock: WASocket | null;
  status: RobotStatus;
  qr: string | null; // imagem do QR Code (data URL)
  qrCount: number;
  wantQr: boolean; // alguém pediu para conectar um número novo
  lastError: string | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  starting: boolean;
  me: { phone: string; name: string | null } | null;
  shutdownHooked: boolean;
};

const g = globalThis as unknown as { __waRobot?: RobotState };
const S: RobotState = (g.__waRobot ??= {
  instanceId: randomBytes(8).toString("hex"),
  sock: null,
  status: "OFF",
  qr: null,
  qrCount: 0,
  wantQr: false,
  lastError: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
  starting: false,
  me: null,
  shutdownHooked: false,
});

const LEASE_MS = 60_000;
const MAX_QR = 6; // ~2 minutos de QR Code antes de desistir

// Logger silencioso no formato que a biblioteca espera (não polui os logs do servidor).
const silent = {
  level: "silent",
  child() {
    return silent;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
};

async function logEvent(kind: string, detail?: string) {
  await prisma.waEvent.create({ data: { kind, detail: detail?.slice(0, 500) ?? null } }).catch(() => {});
}

function publish() {
  emitToStaff("wa:status", robotSnapshot());
}

/** Situação atual para a tela do portal. */
export function robotSnapshot() {
  return {
    status: S.status,
    qr: S.status === "QR" ? S.qr : null,
    me: S.me,
    lastError: S.lastError,
  };
}

export const robotConnected = () => S.status === "CONNECTED" && !!S.sock;

/** Garante que só este servidor fala com o WhatsApp (renova o "aluguel" a cada chamada). */
async function holdLease(): Promise<boolean> {
  const now = new Date();
  const { count } = await prisma.waConfig.updateMany({
    where: { id: 1, OR: [{ leaseOwner: null }, { leaseOwner: S.instanceId }, { leaseUntil: { lt: now } }] },
    data: { leaseOwner: S.instanceId, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  return count > 0;
}

async function releaseLease() {
  await prisma.waConfig.updateMany({ where: { id: 1, leaseOwner: S.instanceId }, data: { leaseOwner: null, leaseUntil: null } }).catch(() => {});
}

function hookShutdown() {
  if (S.shutdownHooked) return;
  S.shutdownHooked = true;
  const stop = async () => {
    try {
      S.sock?.end(undefined);
    } catch {}
    await releaseLease();
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
}

const hasSession = async () => {
  const creds = await prisma.waAuth.findUnique({ where: { id: "creds" }, select: { id: true } });
  return !!creds;
};

/**
 * Chamado pelo relógio do servidor (a cada ~20 s): mantém o aluguel e liga o robô se houver sessão salva
 * ou se alguém pediu o QR Code. Não faz nada se outro servidor estiver com o robô.
 */
export async function robotTick() {
  hookShutdown();
  if (!(await holdLease())) {
    if (S.status !== "CONNECTED") {
      S.status = "WAITING_LEASE";
      publish();
    }
    return;
  }
  if (S.sock || S.starting || S.reconnectTimer) return;
  if (S.wantQr || (await hasSession())) await start();
  else if (S.status !== "OFF") {
    S.status = "OFF";
    publish();
  }
}

/** Tela do portal: "Conectar WhatsApp" (gera o QR Code). */
export async function requestQr() {
  S.wantQr = true;
  S.qrCount = 0;
  S.lastError = null;
  if (!S.sock && !S.starting) await robotTick();
  return robotSnapshot();
}

/** Tela do portal: "Reconectar" (reinicia a conexão com a sessão salva). */
export async function reconnect() {
  try {
    S.sock?.end(undefined);
  } catch {}
  S.sock = null;
  if (S.reconnectTimer) clearTimeout(S.reconnectTimer);
  S.reconnectTimer = null;
  S.reconnectAttempts = 0;
  await robotTick();
  return robotSnapshot();
}

/** Tela do portal: "Desconectar / trocar número": sai do WhatsApp e apaga a sessão. */
export async function logout(by: string) {
  try {
    await S.sock?.logout();
  } catch {}
  try {
    S.sock?.end(undefined);
  } catch {}
  S.sock = null;
  S.me = null;
  S.wantQr = false;
  S.status = "OFF";
  S.qr = null;
  await clearAuthState();
  await prisma.waConfig.update({ where: { id: 1 }, data: { connectedPhone: null, connectedName: null, connectedAt: null } });
  await logEvent("LOGOUT", `Desconectado no portal por ${by}`);
  publish();
  return robotSnapshot();
}

const phoneFromJid = (jid: string | null | undefined) => {
  const d = (jid ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");
  return d.startsWith("55") ? d.slice(2) : d;
};

async function start() {
  S.starting = true;
  S.status = "CONNECTING";
  publish();
  try {
    const lib = await import("@whiskeysockets/baileys");
    const makeWASocket = lib.default;
    const { DisconnectReason } = lib;
    const { state, saveCreds } = await useDbAuthState(lib);
    let version: [number, number, number] | undefined;
    try {
      const latest = await lib.fetchLatestBaileysVersion({ timeout: 5000 });
      version = latest.version;
    } catch {
      // sem internet para consultar: usa a versão embutida na biblioteca
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: silent as never,
      browser: ["Mega Esfiha Portal", "Chrome", "1.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
    });
    S.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        if (!S.wantQr) {
          // Sessão perdida e ninguém pediu QR Code: não fica gerando código à toa.
          S.status = "OFF";
          S.lastError = "A conexão do WhatsApp expirou. Conecte de novo pelo QR Code.";
          S.sock = null;
          sock.end(undefined);
          await logEvent("SESSION_EXPIRED");
          publish();
          return;
        }
        S.qrCount++;
        if (S.qrCount > MAX_QR) {
          S.wantQr = false;
          S.status = "OFF";
          S.qr = null;
          S.lastError = "O QR Code expirou sem ser lido. Clique em Conectar para gerar outro.";
          S.sock = null;
          sock.end(undefined);
          publish();
          return;
        }
        S.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 320 });
        S.status = "QR";
        publish();
      }
      if (u.connection === "open") {
        S.status = "CONNECTED";
        S.qr = null;
        S.wantQr = false;
        S.lastError = null;
        S.reconnectAttempts = 0;
        S.me = { phone: phoneFromJid(sock.user?.id), name: sock.user?.name ?? sock.user?.verifiedName ?? null };
        await prisma.waConfig.update({
          where: { id: 1 },
          data: { connectedPhone: S.me.phone, connectedName: S.me.name, connectedAt: new Date(), lastSyncAt: new Date() },
        });
        await logEvent("CONNECTED", `Conectado como ${S.me.phone}`);
        publish();
        void import("./queue").then((q) => q.kickQueue());
      }
      if (u.connection === "close") {
        const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        S.sock = null;
        if (code === DisconnectReason.loggedOut) {
          S.status = "OFF";
          S.me = null;
          S.lastError = "O WhatsApp foi desconectado pelo celular. Conecte de novo pelo QR Code.";
          await clearAuthState();
          await prisma.waConfig.update({ where: { id: 1 }, data: { connectedPhone: null, connectedName: null, connectedAt: null } });
          await logEvent("LOGGED_OUT", "Sessão encerrada pelo celular (Aparelhos conectados)");
          publish();
          return;
        }
        if (S.status === "OFF") return; // encerrado de propósito (QR expirado, logout)
        // Reinício pedido pelo WhatsApp (normal logo após ler o QR Code): reconecta na hora.
        const delay =
          code === DisconnectReason.restartRequired
            ? 500
            : code === DisconnectReason.connectionReplaced
              ? 60_000
              : Math.min(5_000 * 2 ** S.reconnectAttempts, 300_000);
        S.reconnectAttempts++;
        S.status = "CONNECTING";
        S.lastError = code === DisconnectReason.connectionReplaced ? "Outra conexão assumiu este WhatsApp. Tentando de novo em 1 minuto." : null;
        await logEvent("DISCONNECTED", `Código ${code ?? "?"}; nova tentativa em ${Math.round(delay / 1000)} s`);
        publish();
        S.reconnectTimer = setTimeout(() => {
          S.reconnectTimer = null;
          void robotTick();
        }, delay);
      }
    });

    // Confirmações do WhatsApp: entregue (2 tiques) e lida (tiques azuis).
    sock.ev.on("messages.update", async (updates) => {
      for (const { key, update } of updates) {
        if (!key.fromMe || !key.id || typeof update.status !== "number") continue;
        const now = new Date();
        if (update.status >= 4) {
          await prisma.waMessage.updateMany({ where: { providerId: key.id }, data: { status: "READ", readAt: now } });
        } else if (update.status === 3) {
          await prisma.waMessage.updateMany({
            where: { providerId: key.id, status: { in: ["SENT"] } },
            data: { status: "DELIVERED", deliveredAt: now },
          });
        }
      }
      await prisma.waConfig.update({ where: { id: 1 }, data: { lastSyncAt: new Date() } }).catch(() => {});
    });

    // Respostas dos clientes: SAIR / VOLTAR / nota de 1 a 5.
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        const jid = m.key.remoteJid ?? "";
        if (m.key.fromMe || !jid.endsWith("@s.whatsapp.net")) continue;
        const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "";
        if (!text) continue;
        const { handleIncoming } = await import("./automations");
        await handleIncoming(phoneFromJid(jid), text, m.pushName ?? null).catch((err) =>
          console.warn("[whatsapp] resposta do cliente:", err instanceof Error ? err.message : err),
        );
      }
    });
  } catch (err) {
    S.sock = null;
    S.status = "OFF";
    S.lastError = err instanceof Error ? err.message : "Falha ao iniciar o WhatsApp.";
    await logEvent("ERROR", S.lastError);
    publish();
  } finally {
    S.starting = false;
  }
}

/** Envia um texto. Resolve o endereço real do número no WhatsApp (o 9º dígito varia). */
export async function robotSendText(phone: string, text: string): Promise<{ id: string; jid: string }> {
  const sock = S.sock;
  if (!sock || S.status !== "CONNECTED") throw new Error("WhatsApp da loja desconectado.");
  const contact = await prisma.waContact.findUnique({ where: { phone }, select: { jid: true } });
  let jid = contact?.jid ?? null;
  if (!jid) {
    const [res] = (await sock.onWhatsApp(`55${phone}`)) ?? [];
    if (!res?.exists) throw new Error("Este número não tem WhatsApp.");
    jid = res.jid;
    await prisma.waContact.upsert({ where: { phone }, create: { phone, jid }, update: { jid } });
  }
  const sent = await sock.sendMessage(jid, { text });
  if (!sent?.key.id) throw new Error("O WhatsApp não confirmou o envio.");
  return { id: sent.key.id, jid };
}
