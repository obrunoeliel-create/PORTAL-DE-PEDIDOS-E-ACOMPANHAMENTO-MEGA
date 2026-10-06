// Rate limiter de janela fixa em memória.
// Suficiente para uma instância única. Com múltiplas instâncias, troque o Map por Redis (ex: @upstash/ratelimit).

type Bucket = { count: number; resetAt: number };

const globalStore = globalThis as unknown as { __rateLimit?: Map<string, Bucket> };
const store = (globalStore.__rateLimit ??= new Map<string, Bucket>());

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (store.size > 10_000) {
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

/** Zera um contador (ex: a loja redefiniu a senha do cliente, então ele pode tentar de novo). */
export function clearRateLimit(key: string) {
  store.delete(key);
}
