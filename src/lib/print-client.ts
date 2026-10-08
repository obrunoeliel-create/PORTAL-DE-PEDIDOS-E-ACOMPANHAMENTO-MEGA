// Impressão de pedidos e contas de mesa pela impressora da loja (a impressora padrão do computador).
// A página de impressão é aberta num quadro invisível e o navegador abre a janela de impressão;
// com o Chrome/Edge em modo "impressão direta" (--kiosk-printing) sai direto, sem janela.

const WIDTH_KEY = "of_print_width";
const AUTO_KEY = "of_print_on_accept";

export type PaperWidth = "80" | "58" | "a4";

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // sem armazenamento (aba anônima): vale só para esta sessão
  }
}

/** Largura do papel escolhida neste aparelho (padrão: bobina de 80 mm). */
export function getPaperWidth(): PaperWidth {
  const v = read(WIDTH_KEY);
  return v === "58" || v === "a4" ? v : "80";
}
export const setPaperWidth = (w: PaperWidth) => write(WIDTH_KEY, w === "80" ? null : w);

/** Imprimir sozinho ao aceitar um pedido (cupom para a cozinha). Desligado por padrão. */
export const getPrintOnAccept = () => read(AUTO_KEY) === "1";
export const setPrintOnAccept = (on: boolean) => write(AUTO_KEY, on ? "1" : null);

/** Imprime uma página de /admin/imprimir/... sem sair da tela atual. */
export function printDocument(path: string) {
  const url = `${path}${path.includes("?") ? "&" : "?"}w=${getPaperWidth()}&auto=1`;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener("message", onMessage);
    setTimeout(() => frame.remove(), 1000);
  };
  const onMessage = (e: MessageEvent) => {
    if (e.origin === window.location.origin && e.source === frame.contentWindow && e.data === "of:printed") cleanup();
  };
  window.addEventListener("message", onMessage);
  // Garantia: some depois de 2 min mesmo se o navegador não avisar o fim da impressão.
  setTimeout(cleanup, 120_000);
  frame.src = url;
  document.body.appendChild(frame);
}
