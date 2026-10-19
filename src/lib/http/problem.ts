/**
 * VectorTinta — Emisión de problemas RFC 7807 (plan §3.1/§3.3).
 *
 * Toda respuesta de error 4xx/5xx pasa por `problemResponse`: la forma la fija
 * `domain/errors.ts` (makeProblem) — módulo isomorfo compartido con el cliente.
 * `zodProblem` traduce un ZodError a entries `{field, code, …}` por cada issue
 * (códigos canónicos: too_small | too_big | invalid_type | unrecognized_key |
 * invalid_string…), detallando el campo exacto para que la UI marque el input.
 */
import { NextResponse } from "next/server";
import type { z } from "zod";
import { ApiProblem, makeProblem, type Problem, type ProblemErrorItem, type ProblemKind } from "@/lib/domain/errors";

/** Cabeceras adicionales del problema (p. ej. `Retry-After` en 429). */
export type ProblemHeaders = Record<string, string>;

/** Respuesta JSON con el problema RFC 7807 y el código HTTP de su clase. */
export function problemResponse(
  kind: ProblemKind,
  data: Omit<Partial<Problem>, "type" | "status"> & { title: string },
  extraHeaders?: ProblemHeaders,
): NextResponse {
  const problem = makeProblem(kind, data);
  return NextResponse.json(problem, {
    status: problem.status,
    headers: extraHeaders,
  });
}

/** Ruta de la petición para `instance` (relativa, sin host). */
export function requestPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * Traduce un issue de Zod v4 al código canónico del contrato.
 * Formas reales verificadas: too_small {minimum, inclusive, origin} ·
 * too_big {maximum, …} · invalid_type {expected, received} ·
 * invalid_format {format: 'email'|'regex', pattern} · unrecognized_keys {keys[]}.
 */
/** Tipo de un issue de Zod v4 sin depender del espacio de nombres core. */
type ZodIssueLike = (z.ZodError["issues"])[number];

function issueToItems(issue: ZodIssueLike): ProblemErrorItem[] {
  const field = issue.path.length > 0 ? issue.path.map(String).join(".") : undefined;
  const record = issue as unknown as Record<string, unknown>;

  switch (issue.code) {
    case "unrecognized_keys": {
      // Un issue por clave desconocida: la UI marca cada campo exacto.
      const keys = Array.isArray(record.keys) ? (record.keys as unknown[]) : [];
      const base = typeof field === "string" && field.length > 0 ? `${field}.` : "";
      return keys.map((key) => ({
        field: `${base}${String(key)}`,
        code: "unrecognized_key",
      }));
    }
    case "too_small": {
      const min = record.minimum;
      const entry: ProblemErrorItem = { code: "too_small" };
      if (typeof min === "number") {
        if (record.origin === "string" || record.origin === "array") entry.minLength = min;
        else entry.min = min;
      }
      return [withField(entry, field)];
    }
    case "too_big": {
      const max = record.maximum;
      const entry: ProblemErrorItem = { code: "too_big" };
      if (typeof max === "number") {
        if (record.origin === "string" || record.origin === "array") entry.maxLength = max;
        else entry.max = max;
      }
      return [withField(entry, field)];
    }
    case "invalid_type": {
      const entry: ProblemErrorItem = { code: "invalid_type" };
      if (typeof record.expected === "string") entry.expected = record.expected;
      return [withField(entry, field)];
    }
    case "invalid_format": {
      // Emails, regex, uuid… → código canónico invalid_string con el formato/patrón.
      const entry: ProblemErrorItem = { code: "invalid_string" };
      if (typeof record.format === "string") entry.format = record.format;
      if (typeof record.pattern === "string") entry.pattern = record.pattern;
      return [withField(entry, field)];
    }
    default: {
      const entry: ProblemErrorItem = { code: String(issue.code) };
      return [withField(entry, field)];
    }
  }
}

function withField(entry: ProblemErrorItem, field: string | undefined): ProblemErrorItem {
  if (typeof field === "string" && field.length > 0) entry.field = field;
  return entry;
}

/** Construye el objeto Problem `validacion` con detalle por campo de un ZodError. */
export function zodProblemObject(error: z.ZodError, instance: string): Problem {
  const errors = error.issues.flatMap(issueToItems);
  return makeProblem("validacion", {
    title: "Cuerpo inválido",
    detail: "La petición no supera la validación por campos.",
    instance,
    errors,
  });
}

/** 400 `validacion` con detalle por campo a partir de un ZodError. */
export function zodProblem(error: z.ZodError, instance: string): NextResponse {
  return NextResponse.json(zodProblemObject(error, instance), { status: 400 });
}

/** Lanza un problema como excepción de transporte ApiProblem (la captura withApi). */
export function throwProblem(
  kind: ProblemKind,
  data: Omit<Partial<Problem>, "type" | "status"> & { title: string },
): never {
  const problem = makeProblem(kind, data);
  throw new ApiProblem(problem);
}
