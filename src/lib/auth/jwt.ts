/**
 * VectorTinta — JWT HS256 con node:crypto (cero dependencias externas).
 *
 * `signAccessToken` / `verifyAccessToken`: tokens de acceso Bearer (TTL de
 * server.config). `signAssetUrl` / `verifyAssetUrl`: tokens de URL firmada para
 * el acceso a archivos (`/api/assets/…?t=…`), con la MISMA primitiva HS256 y
 * `typ: "asset"` (un token de acceso NO sirve como token de asset y viceversa:
 * `verify` comprueba `typ`).
 *
 * Constant-time compare vía `crypto.timingSafeEqual` para la firma.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverConfig } from "@/lib/config/server.config";
import { makeProblem, ApiProblem } from "@/lib/domain/errors";

/** Cabecera y tipos de token soportados. */
type JwtTyp = "access" | "asset";

interface JwtPayload {
  sub: string;
  typ: JwtTyp;
  iat: number;
  exp: number;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64url(raw: string): Buffer {
  const normalized = raw.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function hmac(data: string): string {
  return createHmac("sha256", serverConfig.jwtSecret).update(data).digest("base64url");
}

function sign(payload: JwtPayload): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${hmac(signingInput)}`;
}

/** Verifica firma (constante en tiempo) y expiración; devuelve el payload. */
function verify(token: string, expectedTyp: JwtTyp): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw invalidToken();
  const signingInput = `${parts[0]}.${parts[1]}`;
  // La firma se compara como TEXTO base64url (ambos lados ascii, misma
  // codificación): timingSafeEqual sobre bytes del texto, longitud primero.
  const expected = Buffer.from(hmac(signingInput), "ascii");
  const provided = Buffer.from(parts[2], "ascii");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw invalidToken();
  }
  let payload: JwtPayload;
  try {
    payload = JSON.parse(fromBase64url(parts[1]).toString("utf8")) as JwtPayload;
  } catch {
    throw invalidToken();
  }
  if (payload.typ !== expectedTyp) throw invalidToken();
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) throw invalidToken();
  return payload;
}

function invalidToken(): ApiProblem {
  return new ApiProblem(
    makeProblem("no-autenticado", {
      title: "No autenticado",
      detail: "El token de acceso es inválido o ha caducado.",
    }),
  );
}

/* ──────────────────── Access tokens (Authorization: Bearer) ──────────────────── */

/** Emite un access token HS256 {sub, typ:'access', iat, exp}. */
export function signAccessToken(input: { sub: string; ttlSeconds?: number }): string {
  const ttl = input.ttlSeconds ?? serverConfig.accessTokenTtlSeconds;
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: input.sub, typ: "access", iat: now, exp: now + ttl });
}

/** Verifica un access token → {sub} o lanza no-autenticado. */
export function verifyAccessToken(token: string): { sub: string } {
  const payload = verify(token, "access");
  return { sub: payload.sub };
}

/* ──────────────────── Tokens de URL firmada para assets ──────────────────── */

/** Token de acceso a un archivo del almacenamiento (sub = clave del recurso). */
export function signAssetUrl(key: string): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: key, typ: "asset", iat: now, exp: now + serverConfig.signedUrlTtlSeconds });
}

/** Verifica un token de asset → clave autorizada, o lanza no-autenticado. */
export function verifyAssetUrl(token: string): string {
  const payload = verify(token, "asset");
  return payload.sub;
}
