/**
 * VectorTinta — Errores RFC 7807 (plan §3.1).
 *
 * Módulo ISOMORFO: el servidor los EMITE (jsonProblem → Response) y el
 * cliente los PARSEA (api-client → ApiProblem) con la MISMA forma.
 * Taxonomía de clases y severidades de UI: docs/decisions/failure-modes.md.
 */

/** URL base de los tipos de problema (canónica del plan §3.3). */
export const PROBLEM_BASE_URL = "https://vectortinta.example/problems";

export type ProblemKind =
  | "validacion" // 400 — cuerpo inválido (Zod, campos desconocidos…)
  | "params-invalidos" // 400 — params de otro preset / preset desconocido
  | "json-inseguro" // 400 — claves peligrosas / profundidad / PII
  | "no-autenticado" // 401 — token ausente/expirado/inválido
  | "no-encontrado" // 404 — inexistente O ajeno (no se filtra existencia)
  | "conflicto" // 409 — invariantes de negocio (email, orden, capas > máx)
  | "cuota-proyectos" // 409 — cuota del plan gratuito excedida
  | "cuota-assets" // 409 — máx. de assets por proyecto
  | "cuota-exports" // 409 — cuota diaria de exportaciones
  | "capas-maximas" // 409 — capas > maxPerVectorization
  | "payload-grande" // 413 — Content-Length > límite, detectado ANTES de leer
  | "demasiadas-peticiones" // 429 — rate limit (ventana deslizante en memoria)
  | "temporal" // 503 — almacenamiento/IO transitorio (reintentar con backoff)
  | "configuracion" // 503 — clase CONFIG (variable de entorno ausente…)
  | "interno"; // 500 — fallo no clasificado (se registra en diagnóstico)

/** Código HTTP por clase de problema. */
export const PROBLEM_STATUS: Record<ProblemKind, number> = {
  validacion: 400,
  "params-invalidos": 400,
  "json-inseguro": 400,
  "no-autenticado": 401,
  "no-encontrado": 404,
  conflicto: 409,
  "cuota-proyectos": 409,
  "cuota-assets": 409,
  "cuota-exports": 409,
  "capas-maximas": 409,
  "payload-grande": 413,
  "demasiadas-peticiones": 429,
  temporal: 503,
  configuracion: 503,
  interno: 500,
};

/** Error puntual dentro de un problema (campo/recurso concreto). */
export interface ProblemErrorItem {
  /** Campo del body (`params.strokeWidth`) o recurso (`projects`). Uno de los dos SIEMPRE. */
  field?: string;
  resource?: string;
  code: string; // too_small | invalid_type | unrecognized_key | quota_exceeded | …
  [k: string]: unknown; // minLength, limit, hint, limitBytes, retryAfterSeconds…
}

export interface Problem {
  type: string; // URL canónica
  title: string;
  status: number;
  detail?: string;
  instance?: string; // ruta de la petición
  errors?: ProblemErrorItem[];
  [k: string]: unknown; // extensiones: supportedPresets, retryAfterSeconds, sugerencia…
}

/** Fabrica un problema con la URL canónica de su clase. */
export function makeProblem(
  kind: ProblemKind,
  data: Omit<Partial<Problem>, "type" | "status"> & { title: string },
): Problem {
  return {
    type: `${PROBLEM_BASE_URL}/${kind}`,
    status: PROBLEM_STATUS[kind],
    ...data,
  };
}

/**
 * Excepción de transporte con el problema RFC 7807 completo.
 * El api-client la lanza tras parsear la respuesta; la UI la traduce
 * a estados de panel/toast según failure-modes.md.
 */
export class ApiProblem extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "ApiProblem";
    this.problem = problem;
  }

  /** Clase inferida desde la URL de tipo (idempotente con el emisor). */
  get kind(): ProblemKind | null {
    if (this.problem.type.startsWith(`${PROBLEM_BASE_URL}/`)) {
      const tail = this.problem.type.slice(PROBLEM_BASE_URL.length + 1) as ProblemKind;
      return tail in PROBLEM_STATUS ? tail : null;
    }
    return null;
  }
}

/** True si el valor tiene forma de problema RFC 7807 (guard de lectura en el cliente). */
export function looksLikeProblem(value: unknown): value is Problem {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "title" in value &&
    "status" in value &&
    typeof (value as Problem).type === "string"
  );
}
