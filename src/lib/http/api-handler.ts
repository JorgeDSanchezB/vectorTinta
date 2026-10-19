/**
 * VectorTinta — Envoltorio transversal de rutas API (`withApi`, plan §3.1).
 *
 * TODAS las rutas pasan por aquí. Orden de responsabilidades:
 *   1. AUTH: si `opts.auth`, exige `Authorization: Bearer` válido (401 canónico
 *      no-autenticado). Se hace antes del rate limit de mutaciones porque su
 *      clave ES el userId (spec §3.1: mutaciones → por usuario).
 *   2. RATE LIMIT: ventana deslizante por bucket (general/IP, auth/IP,
 *      mutations/userId). 429 con cabecera `Retry-After` + problema RFC 7807.
 *   3. HANDLER con `ctx.params` YA resuelto (Next 16: params es Promise).
 *   4. MÉTRICA: registra el código HTTP de Toda respuesta (éxito o problema).
 *   5. TRADUCCIÓN de errores: ApiProblem y ApiConfigError → RFC 7807 tal cual;
 *      Prisma P2002 → conflicto; lo desconocido → 500 `interno` con
 *      console.error trazable (nunca se filtra el stack al cliente).
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverConfig } from "@/lib/config/server.config";
import { ApiProblem, makeProblem } from "@/lib/domain/errors";
import { requireAuth } from "@/lib/auth/guards";
import { recordRequest } from "@/lib/metrics";
import { problemResponse, requestPath } from "@/lib/http/problem";
import { checkRateLimit, clientIp, type RateBucket } from "@/lib/http/rate-limit";

export interface ApiOptions {
  /** Bucket del rate limit; ausente = sin límite (health/metrics). */
  rate?: RateBucket;
  /** Exige Bearer válido y provee `ctx.userId`. */
  auth?: boolean;
}

export interface WithApiContext<P> {
  /** Parámetros dinámicos de la ruta, YA esperados (Next 16: Promise). */
  params: P;
  /** Presente cuando `opts.auth` (sub del access token verificado). */
  userId?: string;
  /** Access token crudo (lo usan refresh/logout para revocación coherente). */
  accessToken?: string;
}

/** Etiqueta humana del bucket para el detail canónico del 429 (plan §3.3). */
function bucketLabel(bucket: RateBucket): string {
  switch (bucket) {
    case "auth":
      return "autenticación";
    case "mutations":
      return "mutaciones";
    default:
      return "operación general";
  }
}

function bucketLimit(bucket: RateBucket): number {
  switch (bucket) {
    case "auth":
      return serverConfig.rateLimits.authPerMin;
    case "mutations":
      return serverConfig.rateLimits.mutationsPerMin;
    default:
      return serverConfig.rateLimits.generalPerMin;
  }
}

type RouteSecondArg = { params?: Promise<unknown> } | undefined;

/**
 * Envuelve un handler de ruta. Uso:
 *   export const GET = withApi({ auth: true, rate: "general" }, async (req, ctx) => …)
 */
export function withApi<P>(
  opts: ApiOptions,
  handler: (req: NextRequest, ctx: WithApiContext<P>) => Promise<Response>,
): (req: NextRequest, route?: RouteSecondArg) => Promise<Response> {
  return async function routeHandler(req: NextRequest, route?: RouteSecondArg): Promise<Response> {
    try {
      // (1) Autenticación (antes del rate de mutaciones: su clave es el userId).
      let userId: string | undefined;
      let accessToken: string | undefined;
      if (opts.auth) {
        const auth = requireAuth(req);
        userId = auth.userId;
        accessToken = auth.accessToken;
      }

      // (2) Rate limit del bucket configurado.
      if (opts.rate) {
        const rateKey = userId ?? clientIp(req.headers);
        const verdict = checkRateLimit(opts.rate, rateKey);
        if (!verdict.ok) {
          const limit = bucketLimit(opts.rate);
          const response = problemResponse(
            "demasiadas-peticiones",
            {
              title: "Límite de peticiones",
              detail: `Has superado ${limit} peticiones/minuto en ${bucketLabel(opts.rate)}.`,
              instance: requestPath(req.url),
              errors: [{ code: "rate_limited", retryAfterSeconds: verdict.retryAfterSeconds }],
            },
            { "Retry-After": String(verdict.retryAfterSeconds) },
          );
          recordRequest(response.status);
          return response;
        }
      }

      // (3) Handler con params ya resueltos.
      const awaited = route?.params !== undefined ? await route.params : undefined;
      const params = (awaited ?? {}) as P;
      const response = await handler(req, { params, userId, accessToken });
      // (4) Métrica del código de salida.
      recordRequest(response.status);
      return response;
    } catch (error) {
      const response = translate(error, req);
      recordRequest(response.status);
      return response;
    }
  };
}

/** Traduce cualquier excepción a su problema RFC 7807 correspondiente. */
function translate(error: unknown, req: NextRequest): NextResponse {
  const instance = requestPath(req.url);

  if (error instanceof ApiProblem) {
    return problemResponse(error.kind ?? "interno", problemWithoutKind(error.problem), extraFor(error));
  }

  // ApiConfigError (migraciones/registros): clase CONFIG → 503 con instrucción.
  if (error instanceof Error && "problem" in error && error.problem instanceof Object) {
    const problem = (error as { problem: ReturnType<typeof makeProblem> }).problem;
    if ("type" in problem && "title" in problem && "status" in problem) {
      return NextResponse.json(problem, { status: problem.status });
    }
  }

  // Prisma P2002 (restricción única, p. ej. email duplicado en una carrera).
  if (error instanceof Error && (error as { code?: string }).code === "P2002") {
    return problemResponse("conflicto", {
      title: "Conflicto de invariantes",
      detail: "La operación viola una restricción única de un recurso ya existente.",
      instance,
    });
  }

  // Desconocido: 500 interno trazable en consola, opaco para el cliente.
  console.error(`[api] error interno en ${instance}:`, error);
  return problemResponse("interno", {
    title: "Error interno",
    detail: "Fallo no clasificado. Queda registrado para diagnóstico.",
    instance,
  });
}

/** El ApiProblem ya lleva su forma completa; makeProblem no debe sobreescribirla. */
function problemWithoutKind(problem: ReturnType<typeof makeProblem>) {
  const { type: _type, status: _status, ...rest } = problem;
  return rest as Omit<Partial<ReturnType<typeof makeProblem>>, "type" | "status"> & {
    title: string;
  };
}

/** Cabeceras extra por clase de problema (429 → Retry-After). */
function extraFor(error: ApiProblem): Record<string, string> | undefined {
  const retry = error.problem.errors?.find((e) => typeof e.retryAfterSeconds === "number")
    ?.retryAfterSeconds;
  if (error.kind === "demasiadas-peticiones" && typeof retry === "number") {
    return { "Retry-After": String(retry) };
  }
  return undefined;
}
