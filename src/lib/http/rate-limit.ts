/**
 * VectorTinta — Rate limiting con ventana deslizante en memoria (plan §3.1).
 *
 * Buckets configurados en server.config: general 100 req/min/IP ·
 * auth 10 req/min/IP · mutations 30 req/min/usuario. La ventana es DESLIZANTE:
 * guardamos el timestamp exacto de cada petición admitida y expulsamos los que
 * caen fuera de 60 s, en vez de contar por bloques fijos (evita ráfagas al
 * filo del minuto). Producción: sustitución de adaptador por Redis (ADR-006),
 * misma interfaz `checkRateLimit`.
 *
 * El estado vive en `globalThis` para sobrevivir al hot reload de desarrollo.
 */
import { serverConfig } from "@/lib/config/server.config";

export type RateBucket = "general" | "auth" | "mutations";

/** Ventana de 60 s en ms. Constante técnica del mecanismo (no de negocio). */
const WINDOW_MS = 60_000;

interface RateState {
  hits: Map<string, number[]>;
}

const globalForRate = globalThis as unknown as { __vtRateState?: RateState };
const state: RateState = globalForRate.__vtRateState ?? { hits: new Map() };
globalForRate.__vtRateState = state;

function limitFor(bucket: RateBucket): number {
  const limits = serverConfig.rateLimits;
  switch (bucket) {
    case "general":
      return limits.generalPerMin;
    case "auth":
      return limits.authPerMin;
    case "mutations":
      return limits.mutationsPerMin;
  }
}

/**
 * Comprueba (y consume, si cabe) una petición del bucket.
 * Devuelve `ok: false` + `retryAfterSeconds` cuando el límite está agotado.
 */
export function checkRateLimit(bucket: RateBucket, key: string): { ok: boolean; retryAfterSeconds: number } {
  const limit = limitFor(bucket);
  const now = Date.now();
  const mapKey = `${bucket}:${key}`;
  const hits = state.hits.get(mapKey) ?? [];
  const fresh = hits.filter((ts) => now - ts < WINDOW_MS);
  if (fresh.length >= limit) {
    const oldest = fresh[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    state.hits.set(mapKey, fresh);
    return { ok: false, retryAfterSeconds };
  }
  fresh.push(now);
  state.hits.set(mapKey, fresh);
  return { ok: true, retryAfterSeconds: 0 };
}

/** IP de cliente percibida por el gateway (Caddy) o peer directo. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "local";
}

/** Limpieza oportunista: bucket de auth golpeado con frecuencia en dev. */
export function sweepRateState(): void {
  const now = Date.now();
  for (const [key, hits] of state.hits) {
    const fresh = hits.filter((ts) => now - ts < WINDOW_MS);
    if (fresh.length === 0) state.hits.delete(key);
    else state.hits.set(key, fresh);
  }
}
