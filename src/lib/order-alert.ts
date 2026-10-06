// Aviso de pedido novo no portal da loja: a voz escolhida pela loja (public/sounds/aviso-pedido.mp3)
// com um sino ao fundo.
// O som já vem ligado. Os navegadores só liberam áudio depois de um gesto do usuário, então o
// contexto é destravado no clique de "Entrar no painel" e, se a página for recarregada, no primeiro
// toque/tecla em qualquer lugar da tela.

const VOICE_URL = "/sounds/aviso-pedido.mp3";
const PREF_KEY = "of_alert_sound";

let ctx: AudioContext | null = null;
let voice: AudioBuffer | null = null;
let voiceLoading: Promise<void> | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  return ctx;
}

function loadVoice(c: AudioContext) {
  voiceLoading ??= fetch(VOICE_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("voice not found"))))
    .then((data) => c.decodeAudioData(data))
    .then((buffer) => {
      voice = buffer;
    })
    .catch(() => {
      voiceLoading = null; // tenta de novo no próximo aviso
    });
  return voiceLoading;
}

/** Libera o áudio. Chame dentro de um clique/toque/tecla (ex: botão de login). */
export function unlockOrderAlert() {
  const c = getContext();
  if (!c) return;
  if (c.state !== "running") void c.resume().catch(() => {});
  void loadVoice(c);
}

/** O navegador já liberou o som nesta página? */
export function isOrderAlertReady() {
  return ctx?.state === "running";
}

/** Avisa quando o navegador libera (ou suspende) o áudio. Devolve a função para cancelar. */
export function onOrderAlertStateChange(cb: () => void) {
  const c = getContext();
  if (!c) return () => {};
  c.addEventListener("statechange", cb);
  return () => c.removeEventListener("statechange", cb);
}

/** Preferência da loja neste aparelho: ligado por padrão; só fica desligado se alguém desligar. */
export function isOrderAlertEnabled() {
  try {
    return window.localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setOrderAlertEnabled(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(PREF_KEY);
    else window.localStorage.setItem(PREF_KEY, "off");
  } catch {
    // sem armazenamento (aba anônima): vale só para esta sessão
  }
}

/** Sino: fundamental + parciais desarmônicos, com decaimento longo. `volume` baixo = sino ao fundo. */
function bell(c: AudioContext, t0: number, volume: number) {
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(c.destination);
  [
    { f: 1318.51, t: 0 },
    { f: 1046.5, t: 0.45 },
  ].forEach((n) => {
    for (const [mult, vol] of [[1, 0.5], [2.76, 0.22], [5.4, 0.1]] as const) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = n.f * mult;
      gain.gain.setValueAtTime(0.0001, t0 + n.t);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + n.t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + 1.6);
      osc.connect(gain).connect(out);
      osc.start(t0 + n.t);
      osc.stop(t0 + n.t + 1.7);
    }
  });
}

/** Toca o aviso de pedido novo (voz da loja com um sino ao fundo). Devolve false se o navegador ainda não liberou o som. */
export function playOrderAlert(): boolean {
  const c = getContext();
  if (!c) return false;
  if (c.state !== "running") {
    void c.resume().catch(() => {});
    return false;
  }
  const t0 = c.currentTime + 0.03;
  if (voice) {
    bell(c, t0, 0.3);
    const src = c.createBufferSource();
    src.buffer = voice;
    src.connect(c.destination);
    src.start(t0 + 0.12);
  } else {
    // Voz ainda carregando (ou indisponível): só o sino, mais alto, para o aviso não passar batido.
    bell(c, t0, 0.9);
    void loadVoice(c);
  }
  return true;
}
