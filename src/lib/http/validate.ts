/**
 * VectorTinta — Validación extensible del borde HTTP (plan §4.2 EXACTO en orden).
 *
 * `guardJson` aplica a CUALQUIER JSON variable (params de preset, manifest de
 * exportación, metadata) la MISMA cadena de guardas, en el orden canónico:
 *   (1) tamaño en bytes ≤ limits.json.maxBytes  → 400 json-inseguro
 *   (2) profundidad ≤ limits.json.maxDepth      → 400 json-inseguro
 *   (3) claves `__proto__`/`prototype`/`constructor` en CUALQUIER nivel → 400
 *       json-inseguro (se RECHAZAN, no se ignoran: defensa en profundidad)
 *   (4) guard anti-PII en strings de primer nivel (email/teléfono) → 400
 *       json-inseguro con hint "los params no admiten datos personales"
 *   (5) safeParse contra el esquema DEL REGISTRO correspondiente (preset o
 *       formato): el validador no conoce presets concretos (regla del carro).
 *
 * `parseJsonBody` controla `Content-Length` ANTES de leer el cuerpo (413 sin
 * leer) y revalida los bytes reales tras la lectura.
 */
import type { z } from "zod";
import { appConfig } from "@/lib/config/app.config";
import { ApiProblem, makeProblem, type ProblemErrorItem } from "@/lib/domain/errors";
import { requestPath, zodProblemObject } from "@/lib/http/problem";

const JSON_LIMITS = appConfig.limits.json;

/* ───────────────────────── Lectura del cuerpo ───────────────────────── */

/**
 * Lee y parsea el cuerpo JSON con control de tamaño en DOS fases:
 * Content-Length ANTES de leer (413 temprano) y bytes reales tras leer.
 */
export async function parseJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number.parseInt(declared, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw payloadTooLarge(maxBytes, req.url);
    }
  }
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw payloadTooLarge(maxBytes, req.url);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiProblem(
      makeProblem("validacion", {
        title: "Cuerpo inválido",
        detail: "El cuerpo no es JSON bienformado.",
        instance: requestPath(req.url),
        errors: [{ code: "invalid_json" }],
      }),
    );
  }
}

function payloadTooLarge(maxBytes: number, url: string): ApiProblem {
  return new ApiProblem(
    makeProblem("payload-grande", {
      title: "Payload demasiado grande",
      detail: `El cuerpo de la petición supera ${maxBytes} bytes.`,
      instance: requestPath(url),
      errors: [{ code: "max_upload_bytes", limitBytes: maxBytes }],
    }),
  );
}

/* ───────────────────── Walker determinista de JSON ───────────────────── */

interface WalkResult {
  depth: number;
  unsafeKeys: { key: string; path: string }[];
  topLevelPii: { key: string; kind: "email" | "phone" }[];
}

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Email plausible: algo@dominio.tld (suficiente como guard, no es parser RFC). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
/** Teléfono plausible: ≥7 dígitos y SOLO dígitos/separadores telefónicos. */
const PHONE_RE = /^\+?[\d\s().-]{7,16}$/u;

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/gu, "").length;
  return PHONE_RE.test(value) && digits >= 7;
}

/**
 * Camino iterativo (sin recursión) sobre el valor JSON ya parseado:
 * calcula profundidad, localiza claves peligrosas en cualquier nivel y aplica
 * el guard anti-PII a los strings de PRIMER nivel (plan §4.2 pasos 2-4).
 */
function walkJson(value: unknown, maxDepth: number): WalkResult {
  const result: WalkResult = { depth: 0, unsafeKeys: [], topLevelPii: [] };
  const root = toPlainValue(value);
  // PII: solo strings de primer nivel (paso 4 del plan §4.2).
  if (isPlainObject(root)) {
    for (const [key, child] of Object.entries(root)) {
      if (typeof child === "string") {
        if (EMAIL_RE.test(child)) result.topLevelPii.push({ key, kind: "email" });
        else if (looksLikePhone(child)) result.topLevelPii.push({ key, kind: "phone" });
      }
    }
  }
  // Pila de trabajo: [valor, profundidad, camino].
  const stack: { value: unknown; depth: number; path: string }[] = [{ value: root, depth: 0, path: "" }];
  while (stack.length > 0) {
    const current = stack.pop() as { value: unknown; depth: number; path: string };
    if (current.depth > result.depth) result.depth = current.depth;
    if (current.depth > maxDepth) continue; // se reporta como profundidad, no se explora más.
    const plain = toPlainValue(current.value);
    if (Array.isArray(plain)) {
      for (let i = plain.length - 1; i >= 0; i -= 1) {
        stack.push({ value: plain[i], depth: current.depth + 1, path: `${current.path}[${i}]` });
      }
      continue;
    }
    if (isPlainObject(plain)) {
      for (const [key, child] of Object.entries(plain)) {
        if (DANGEROUS_KEYS.has(key)) {
          result.unsafeKeys.push({ key, path: current.path === "" ? key : `${current.path}.${key}` });
        }
        stack.push({ value: child, depth: current.depth + 1, path: current.path === "" ? key : `${current.path}.${key}` });
      }
    }
  }
  return result;
}

/** JSON.parse solo produce objetos planos/arreglos/primitivos; esto lo normaliza. */
function toPlainValue(value: unknown): unknown {
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* ───────────────────────────── Guard principal ───────────────────────────── */

export interface GuardJsonOptions<T> {
  /** Esquema del REGISTRO que gobierna este JSON (preset o formato de exportación). */
  schema: z.ZodType<T>;
  /** Prefijo de campo para los errores (p. ej. "params" → params.strokeWidth). */
  fieldPrefix?: string;
  /** Defaults desde config; los acepta el llamante para reutilizar el guard. */
  maxBytes?: number;
  maxDepth?: number;
  /** Ruta de la petición para `instance`. */
  instance?: string;
}

/**
 * Pasos 1-4 del plan §4.2 (lanzables de forma independiente para JSONs cuyo
 * esquema se resuelve DESPUÉS, p. ej. params: primero existe el preset).
 */
export function assertJsonSafe(
  value: unknown,
  opts: { fieldPrefix?: string; maxBytes?: number; maxDepth?: number; instance?: string } = {},
): void {
  const maxBytes = opts.maxBytes ?? JSON_LIMITS.maxBytes;
  const maxDepth = opts.maxDepth ?? JSON_LIMITS.maxDepth;
  const prefix = opts.fieldPrefix;
  const instance = opts.instance ?? "";
  const fieldOf = (key: string) => (prefix ? `${prefix}.${key}` : key);

  // (1) Tamaño en bytes del valor serializado.
  const bytes =
    value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value) ?? "null", "utf8");
  if (bytes > maxBytes) {
    throw jsonUnsafe(
      `El objeto supera ${maxBytes} bytes.`,
      [{ field: prefix ?? undefined, code: "json_too_large", limitBytes: maxBytes }],
      instance,
    );
  }

  const walk = walkJson(value, maxDepth);

  // (2) Profundidad.
  if (walk.depth > maxDepth) {
    throw jsonUnsafe(
      `La anidación supera ${maxDepth} niveles.`,
      [{ field: prefix ?? undefined, code: "json_too_deep", maxDepth }],
      instance,
    );
  }

  // (3) Claves peligrosas en cualquier nivel: RECHAZADAS (no ignoradas).
  if (walk.unsafeKeys.length > 0) {
    throw jsonUnsafe(
      "El objeto contiene claves prohibidas (__proto__/prototype/constructor).",
      walk.unsafeKeys.map((k) => ({ field: fieldOf(k.path), code: "unsafe_key" })),
      instance,
    );
  }

  // (4) Guard anti-PII en strings de primer nivel.
  if (walk.topLevelPii.length > 0) {
    throw jsonUnsafe(
      "Los params no admiten datos personales.",
      walk.topLevelPii.map((p) => ({
        field: fieldOf(p.key),
        code: "personal_data",
        kind: p.kind,
        hint: "los params no admiten datos personales",
      })),
      instance,
    );
  }
}

function jsonUnsafe(detail: string, errors: ProblemErrorItem[], instance: string): ApiProblem {
  return new ApiProblem(
    makeProblem("json-inseguro", {
      title: "JSON no admitido",
      detail,
      instance,
      errors,
    }),
  );
}

/**
 * Parsea y valida un cuerpo JSON contra un esquema `.strict()` de requests.ts.
 * SIN guard anti-PII: los cuerpos de AUTH llevan email legítimamente (el guard
 * §4.2 aplica a JSONs variables: params/manifests, nunca a credenciales).
 */
export async function parseStrictBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  maxBytes: number = JSON_LIMITS.maxBytes,
): Promise<T> {
  const raw = await parseJsonBody(req, maxBytes);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiProblem(zodProblemObject(parsed.error, requestPath(req.url)));
  }
  return parsed.data;
}

/**
 * Cuerpo de refresh: PERMITE cuerpo vacío (cookie-only) y extrae SOLO el
 * campo refreshToken; el resto se ignora deliberadamente (el token viaja en
 * cookie httpOnly, el body es vía alternativa documentada en §3.1).
 */
export async function parseRefreshBody(req: Request): Promise<string | undefined> {
  const text = await req.text();
  if (text.trim().length === 0) return undefined;
  if (Buffer.byteLength(text, "utf8") > JSON_LIMITS.maxBytes) {
    throw payloadTooLarge(JSON_LIMITS.maxBytes, req.url);
  }
  try {
    const raw = JSON.parse(text) as unknown;
    if (!isPlainObject(raw)) return undefined;
    const token = raw.refreshToken;
    return typeof token === "string" && token.length > 0 ? token : undefined;
  } catch {
    throw new ApiProblem(
      makeProblem("validacion", {
        title: "Cuerpo inválido",
        detail: "El cuerpo no es JSON bienformado.",
        instance: requestPath(req.url),
        errors: [{ code: "invalid_json" }],
      }),
    );
  }
}

/**
 * Cadena COMPLETA del plan §4.2: guardas 1-4 + safeParse (5) contra el esquema
 * del registro dado. Devuelve el valor tipado o lanza ApiProblem.
 */
export function guardJson<T>(value: unknown, opts: GuardJsonOptions<T>): T {
  const instance = opts.instance ?? "";
  assertJsonSafe(value, opts);
  const parsed = opts.schema.safeParse(value);
  if (!parsed.success) {
    const problem = zodProblemObject(parsed.error, instance);
    // Prefijo de campo canónico: params.strokeWidth, manifest.printOrder… según llamante.
    if (opts.fieldPrefix && problem.errors) {
      problem.errors = problem.errors.map((entry) =>
        typeof entry.field === "string" && entry.field.length > 0
          ? { ...entry, field: `${opts.fieldPrefix}.${entry.field}` }
          : entry,
      );
    }
    throw new ApiProblem(problem);
  }
  return parsed.data;
}

/**
 * Guard anti-PII puntual para strings sueltos (nombres de capa, etc.):
 * el plan aplica el guard de 8 KiB al subobjeto params "y a cada layer name".
 */
export function assertNoPiiString(value: string, field: string, instance = ""): void {
  if (EMAIL_RE.test(value) || looksLikePhone(value)) {
    throw jsonUnsafe(
      "Los params no admiten datos personales.",
      [{ field, code: "personal_data", hint: "los params no admiten datos personales" }],
      instance,
    );
  }
}
