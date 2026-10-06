// Som de comemoração da Mesa Premiada: sinos de Natal + fanfarra de vitória.
// 1º) Web Audio API (sintetizado, sem arquivo de áudio);
// 2º) reserva: um WAV gerado na hora e tocado com <audio> (HTML5), para navegadores sem Web Audio.
// Deve ser chamado a partir de um clique (os navegadores só liberam áudio após um gesto do usuário).

type Note = { f: number; t: number; d: number };

const N = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093 };

// "Jingle" de sinos (começo do Jingle Bells) e, em seguida, a fanfarra subindo até o acorde final.
const BELLS: Note[] = [
  { f: N.E6, t: 0.0, d: 0.5 },
  { f: N.E6, t: 0.22, d: 0.5 },
  { f: N.E6, t: 0.44, d: 0.8 },
  { f: N.E6, t: 0.88, d: 0.5 },
  { f: N.E6, t: 1.1, d: 0.5 },
  { f: N.E6, t: 1.32, d: 0.8 },
  { f: N.E6, t: 1.76, d: 0.5 },
  { f: N.G6, t: 1.98, d: 0.5 },
  { f: N.C6, t: 2.2, d: 0.5 },
  { f: N.D6, t: 2.42, d: 0.5 },
  { f: N.E6, t: 2.64, d: 1.2 },
];
const FANFARE: Note[] = [
  { f: N.C5, t: 3.3, d: 0.16 },
  { f: N.E5, t: 3.46, d: 0.16 },
  { f: N.G5, t: 3.62, d: 0.16 },
  { f: N.C6, t: 3.78, d: 0.9 },
  { f: N.E5, t: 3.78, d: 0.9 },
  { f: N.G5, t: 3.78, d: 0.9 },
];
const TOTAL_SECONDS = 4.9;

function playWithWebAudio(): boolean {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return false;
  const ctx = new Ctx();
  void ctx.resume();
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05;

  // Sino: fundamental + parciais desarmônicos com decaimento rápido.
  for (const n of BELLS) {
    for (const [mult, vol] of [[1, 0.5], [2.76, 0.22], [5.4, 0.1]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.f * mult;
      g.gain.setValueAtTime(0.0001, t0 + n.t);
      g.gain.exponentialRampToValueAtTime(vol, t0 + n.t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
      osc.connect(g).connect(master);
      osc.start(t0 + n.t);
      osc.stop(t0 + n.t + n.d + 0.05);
    }
  }
  // Fanfarra: timbre de metal (dente de serra filtrado).
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2600;
  filter.connect(master);
  for (const n of FANFARE) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = n.f;
    g.gain.setValueAtTime(0.0001, t0 + n.t);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + n.t + 0.03);
    g.gain.setValueAtTime(0.22, t0 + n.t + n.d * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
    osc.connect(g).connect(filter);
    osc.start(t0 + n.t);
    osc.stop(t0 + n.t + n.d + 0.05);
  }
  setTimeout(() => void ctx.close().catch(() => {}), (TOTAL_SECONDS + 0.5) * 1000);
  return true;
}

/** Reserva: gera um WAV (PCM 16 bits mono) com as mesmas notas e toca com HTML5 Audio. */
function playWithHtmlAudio(): boolean {
  try {
    const rate = 22050;
    const samples = new Int16Array(Math.floor(rate * TOTAL_SECONDS));
    for (const n of [...BELLS, ...FANFARE]) {
      const start = Math.floor(n.t * rate);
      const len = Math.floor(n.d * rate);
      for (let i = 0; i < len && start + i < samples.length; i++) {
        const env = Math.exp((-4 * i) / len);
        const v = Math.sin((2 * Math.PI * n.f * i) / rate) * env * 6000;
        samples[start + i] = Math.max(-32768, Math.min(32767, samples[start + i] + v));
      }
    }
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const dv = new DataView(buf);
    const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF");
    dv.setUint32(4, 36 + samples.length * 2, true);
    str(8, "WAVEfmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    str(36, "data");
    dv.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) => dv.setInt16(44 + i * 2, s, true));
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    void audio.play().catch(() => URL.revokeObjectURL(url));
    return true;
  } catch {
    return false;
  }
}

/** Toca a comemoração. Nunca lança erro: sem áudio disponível, o alerta visual continua valendo. */
export function playCelebration(): void {
  try {
    if (playWithWebAudio()) return;
  } catch {
    /* tenta a reserva */
  }
  playWithHtmlAudio();
}
