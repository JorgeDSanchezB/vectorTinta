/**
 * VectorTinta — Configuración del SERVIDOR (plan §9: env-driven, cero hardcoding de negocio).
 *
 * Todo valor dependiente del entorno (secretos, TTLs, rate limits, rutas de disco)
 * vive AQUÍ y se lee de variables de entorno con defaults explícitos validados
 * con Zod. `app.config.ts` (cliente) es la fuente de los valores de NEGOCIO;
 * este archivo es la fuente de los valores de DESPLIEGUE.
 *
 * `VT_JWT_SECRET` ausente: en desarrollo NO se rompe el arranque (default de
 * desarrollo con warning por consola); en producción sí se exige (clase CONFIG
 * de failure-modes.md: la app no arranca con configuración rota).
 */
import { z } from "zod";

/* ─────────────────────────── Esquemas ─────────────────────────── */

const Argon2ParamsSchema = z.object({
  /** Memoria en KiB (OWASP 2024 para argon2id). */
  memoryCost: z.number().int().positive(),
  timeCost: z.number().int().positive(),
  parallelism: z.number().int().positive(),
});

const RateLimitsSchema = z.object({
  /** Ventana deslizante por minuto/IP (prod: sustituir adaptador por Redis). */
  generalPerMin: z.number().int().positive(),
  authPerMin: z.number().int().positive(),
  /** Por minuto/usuario autenticado. */
  mutationsPerMin: z.number().int().positive(),
});

export const ServerConfigSchema = z.object({
  /** Secreto HS256 de los access tokens y URLs firmadas. */
  jwtSecret: z.string().min(16),
  /** TTL del access token en segundos (plan §3.1: 15 min). */
  accessTokenTtlSeconds: z.number().int().positive(),
  /** Vida del refresh token opaco en días (rotación obligatoria, ADR-007). */
  refreshTokenTtlDays: z.number().int().positive(),
  /** Política de contraseñas (aplicada en el borde, plan §2.2). */
  passwordMinLength: z.number().int().positive(),
  argon2: Argon2ParamsSchema,
  rateLimits: RateLimitsSchema,
  /** Raíz del adaptador de almacenamiento local (prod: S3 — sustitución de adaptador). */
  storageDir: z.string().min(1),
  /** TTL de las URLs firmadas de assets. */
  signedUrlTtlSeconds: z.number().int().positive(),
  /** Versión del producto para GET /api/health. */
  productVersion: z.string().min(1),
  /** Nombre de la cookie httpOnly del refresh token. */
  refreshCookieName: z.string().min(3),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/* ──────────────────────── Lectura del entorno ──────────────────────── */

const isProduction = process.env.NODE_ENV === "production";

function readSecret(): string {
  const fromEnv = process.env.VT_JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (isProduction) {
    // Clase CONFIG: nunca arrancar producción con un secreto de desarrollo.
    throw new Error("server.config: falta VT_JWT_SECRET (obligatorio en producción)");
  }
  // Desarrollo: default explícito + warning ruidoso (NO crash en dev, plan §9).
  console.warn(
    "[server.config] VT_JWT_SECRET ausente: usando secreto de DESARROLLO. NO usar en producción.",
  );
  return "vectortinta-dev-jwt-secret-no-valido-para-produccion";
}

/** Número de entorno con default (Zod valida el resultado, no la cadena). */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const serverConfig: ServerConfig = ServerConfigSchema.parse({
  jwtSecret: readSecret(),
  accessTokenTtlSeconds: envInt("VT_ACCESS_TOKEN_TTL_SECONDS", 900),
  refreshTokenTtlDays: envInt("VT_REFRESH_TOKEN_TTL_DAYS", 30),
  passwordMinLength: envInt("VT_PASSWORD_MIN_LENGTH", 10),
  argon2: {
    memoryCost: envInt("VT_ARGON2_MEMORY_COST", 19456),
    timeCost: envInt("VT_ARGON2_TIME_COST", 2),
    parallelism: envInt("VT_ARGON2_PARALLELISM", 1),
  },
  rateLimits: {
    generalPerMin: envInt("VT_RATE_GENERAL_PER_MIN", 100),
    authPerMin: envInt("VT_RATE_AUTH_PER_MIN", 10),
    mutationsPerMin: envInt("VT_RATE_MUTATIONS_PER_MIN", 30),
  },
  storageDir: process.env.VT_STORAGE_DIR && process.env.VT_STORAGE_DIR !== ""
    ? process.env.VT_STORAGE_DIR
    : ".data/storage",
  signedUrlTtlSeconds: envInt("VT_SIGNED_URL_TTL_SECONDS", 600),
  productVersion: "1.0.0",
  refreshCookieName: "vt_refresh",
});
