import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { prisma } from "../prisma";

/**
 * Sessão do WhatsApp (o que o QR Code autoriza) guardada no banco, cifrada com AES-256-GCM.
 * Mesmo formato do "useMultiFileAuthState" da biblioteca, mas em linhas da tabela WaAuth:
 * sobrevive a reinícios e publicações do portal (o disco do servidor é apagado a cada publicação).
 */

function key(): Buffer {
  const secret = process.env.WA_AUTH_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("WA_AUTH_SECRET (ou JWT_SECRET) ausente ou curto");
  return createHash("sha256").update(`wa-auth:${secret}`).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function decrypt(stored: string): string {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

type Lib = typeof import("@whiskeysockets/baileys");

export async function useDbAuthState(lib: Lib): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const { BufferJSON, initAuthCreds, proto } = lib;

  const read = async (id: string) => {
    const row = await prisma.waAuth.findUnique({ where: { id } });
    if (!row) return null;
    try {
      return JSON.parse(decrypt(row.data), BufferJSON.reviver);
    } catch {
      return null; // chave trocada ou dado corrompido: trata como inexistente
    }
  };
  const write = async (id: string, value: unknown) => {
    const data = encrypt(JSON.stringify(value, BufferJSON.replacer));
    await prisma.waAuth.upsert({ where: { id }, create: { id, data }, update: { data } });
  };
  const remove = (id: string) => prisma.waAuth.deleteMany({ where: { id } });

  const creds: AuthenticationCreds = (await read("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const out: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
              out[id] = value;
            }),
          );
          return out;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            const group = data[category as keyof SignalDataTypeMap] ?? {};
            for (const id in group) {
              const value = group[id];
              tasks.push(value ? write(`${category}-${id}`, value) : remove(`${category}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write("creds", creds),
  };
}

/** Apaga a sessão inteira (ao desconectar ou trocar de número). */
export async function clearAuthState() {
  await prisma.waAuth.deleteMany({});
}
