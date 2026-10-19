/**
 * VectorTinta — Guardas de autenticación (ADR-007: rotación obligatoria).
 *
 * - `requireAuth`: exige `Authorization: Bearer` válido → {userId, accessToken}
 *   o lanza el 401 canónico (plan §3.3, mismo detail para ausente/inválido:
 *   no se filtra cuál de las dos cosas falló).
 * - `issueAuthResponse`: emite access token + refresh OPAZO de 32 bytes
 *   aleatorios. En la cookie httpOnly viaja el token; en la base de datos SOLO
 *   su sha-256 (robo de DB ≠ robo de sesiones). Cookie: Path=/api/auth,
 *   SameSite=Lax, httpOnly, Max-Age = TTL de refresh.
 * - `rotateRefreshToken`: rotación OBLIGATORIA (plan §2.2): un refresh token
 *   vale exactamente 1 uso; cada refresco REVOCa el anterior y emite uno
 *   nuevo (reutilización de uno ya revocado → 401).
 * - `revokeRefreshToken`: logout (idempotente: revoca si existe).
 */
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverConfig } from "@/lib/config/server.config";
import { ApiProblem, makeProblem } from "@/lib/domain/errors";
import type { AuthResponseDto, UserDto } from "@/lib/domain/entities";
import { db } from "@/lib/db";
import { signAccessToken, verifyAccessToken } from "@/lib/auth/jwt";

/** Columnas mínimas del usuario (SELECT explícito; nunca passwordHash). */
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  plan: true,
  createdAt: true,
} as const;

export type SafeUserRow = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  createdAt: Date;
};

export function userDto(user: SafeUserRow): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan === "pro" ? "pro" : "free",
    createdAt: user.createdAt.toISOString(),
  };
}

/* ───────────────────────────── Bearer ───────────────────────────── */

/** 401 canónico del plan §3.3 (mismo cuerpo para token ausente o inválido). */
export function notAuthenticated(): ApiProblem {
  return new ApiProblem(
    makeProblem("no-autenticado", {
      title: "No autenticado",
      detail: "El token de acceso es inválido o ha caducado.",
    }),
  );
}

/** Exige Bearer válido; devuelve el sub verificado y el token crudo. */
export function requireAuth(req: NextRequest): { userId: string; accessToken: string } {
  const header = req.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) throw notAuthenticated();
  const token = header.slice("Bearer ".length).trim();
  if (token.length === 0) throw notAuthenticated();
  const { sub } = verifyAccessToken(token);
  return { userId: sub, accessToken: token };
}

/* ─────────────────────── Refresh tokens opacos ─────────────────────── */

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const isProduction = process.env.NODE_ENV === "production";

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/api/auth",
    secure: isProduction,
    maxAge: serverConfig.refreshTokenTtlDays * 86_400,
  };
}

/** Lee el refresh token de la cookie httpOnly o del body (spec: cookie/body). */
export function readRefreshToken(req: NextRequest, bodyToken?: unknown): string | null {
  const fromCookie = req.cookies.get(serverConfig.refreshCookieName)?.value ?? null;
  if (fromCookie !== null && fromCookie.length > 0) return fromCookie;
  if (typeof bodyToken === "string" && bodyToken.length > 0) return bodyToken;
  return null;
}

async function createRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + serverConfig.refreshTokenTtlDays * 86_400_000);
  await db.refreshToken.create({
    data: { userId, tokenHash: sha256Hex(token), expiresAt },
    select: { id: true }, // SELECT explícito también en escrituras.
  });
  return token;
}

/**
 * Respuesta de autenticación completa (register/login/guest/refresh):
 * AuthResponseDto + cookie httpOnly con el refresh NUEVO.
 */
export async function issueAuthResponse(user: SafeUserRow, status: number): Promise<NextResponse> {
  const accessToken = signAccessToken({ sub: user.id });
  const refreshToken = await createRefreshToken(user.id);
  const body: AuthResponseDto = {
    user: userDto(user),
    accessToken,
    tokenType: "Bearer",
    expiresIn: serverConfig.accessTokenTtlSeconds,
  };
  const response = NextResponse.json(body, { status });
  response.cookies.set(serverConfig.refreshCookieName, refreshToken, refreshCookieOptions());
  return response;
}

/**
 * Rotación OBLIGATORIA (ADR-007): valida el token presentado (cookie o body),
 * lo REVOCa y emite uno nuevo + access token. Token inválido, revocado o
 * expirado → 401 (no se distingue cuál de las tres cosas pasó).
 * Devuelve la respuesta 200 lista + el userId (para auditoría en la ruta).
 */
export async function rotateRefreshToken(
  req: NextRequest,
  bodyToken?: unknown,
): Promise<{ response: NextResponse; userId: string }> {
  const token = readRefreshToken(req, bodyToken);
  if (token === null) throw refreshInvalid();

  const stored = await db.refreshToken.findFirst({
    where: { tokenHash: sha256Hex(token) },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true },
  });
  if (stored === null || stored.revokedAt !== null || stored.expiresAt.getTime() <= Date.now()) {
    throw refreshInvalid();
  }

  // Revocación del token usado: UN solo uso.
  await db.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
    select: { id: true },
  });

  const user = await db.user.findUnique({
    where: { id: stored.userId },
    select: USER_SELECT,
  });
  if (user === null) throw refreshInvalid();

  return { response: await issueAuthResponse(user, 200), userId: user.id };
}

function refreshInvalid(): ApiProblem {
  return new ApiProblem(
    makeProblem("no-autenticado", {
      title: "No autenticado",
      detail: "El refresh token es inválido, revocado o ha caducado.",
    }),
  );
}

/** Logout: revoca el refresh presentado (idempotente) — sin error si no existe. */
export async function revokeRefreshToken(req: NextRequest, bodyToken?: unknown): Promise<void> {
  const token = readRefreshToken(req, bodyToken);
  if (token === null) return;
  const tokenHash = sha256Hex(token);
  const stored = await db.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null },
    select: { id: true },
  });
  if (stored === null) return;
  await db.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
    select: { id: true },
  });
}

/** Borra la cookie del refresh (logout y respuestas de error de refresh). */
export function clearRefreshCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(serverConfig.refreshCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/auth",
    secure: isProduction,
    maxAge: 0,
  });
  return response;
}

/** SELECT de usuario reutilizable por las rutas de auth. */
export const AUTH_USER_SELECT = USER_SELECT;
