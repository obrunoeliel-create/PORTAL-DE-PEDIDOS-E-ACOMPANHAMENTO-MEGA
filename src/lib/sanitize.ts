// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮]/g;

/**
 * Sanitização de texto livre (nomes, endereços, observações).
 * O React já escapa a saída; isto é defesa em profundidade para canais sem escape
 * (mensagem do WhatsApp, impressões, exportações).
 */
export function sanitizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(CONTROL_CHARS, "")
    .replace(/[<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
