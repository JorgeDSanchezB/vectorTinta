/**
 * VectorTinta — Cursor compuesto de paginación (ADR-010, plan §3.1/§3.3).
 *
 * Formato EXACTO del contrato: `base64url(createdAtISO + "|" + id)`.
 * Verificación canónica: base64("2025-05-30T09:00:00Z|p-1") =
 * "MjAyNS0wNS0zMFQwOTowMDowMFp8cC0x" (la usó el árbitro ARB-1, rechazo R-1).
 *
 * El desempate compuesto (createdAt, id) permite paginar índices compuestos
 * `@@index([owner, createdAt, id])` sin saltos ni duplicados.
 */
import { ApiProblem, makeProblem } from "@/lib/domain/errors";

/** Codifica {createdAt, id} como cursor opaco (base64url sin padding). */
export function encodeCursor(cursor: { createdAt: Date; id: string }): string {
  const raw = `${cursor.createdAt.toISOString()}|${cursor.id}`;
  const b64 = Buffer.from(raw, "utf8").toString("base64");
  // base64url: '+'→'-' · '/'→'_' · se elimina el padding '='.
  return b64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/**
 * Decodifica y VALIDA un cursor. Cadena malformada, fecha no ISO o id vacío →
 * problema `validacion` (nunca se "arregla" silenciosamente, plan §4.3).
 */
export function decodeCursor(raw: string): { createdAt: Date; id: string } {
  let decoded: string;
  try {
    const normalized = raw.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    decoded = Buffer.from(padded, "base64").toString("utf8");
  } catch {
    throw malformedCursor(raw);
  }
  const separator = decoded.indexOf("|");
  if (separator < 0) throw malformedCursor(raw);
  const createdAtIso = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  const createdAt = new Date(createdAtIso);
  if (id.length === 0 || Number.isNaN(createdAt.getTime())) throw malformedCursor(raw);
  return { createdAt, id };
}

function malformedCursor(raw: string): ApiProblem {
  const problem = makeProblem("validacion", {
    title: "Cursor inválido",
    detail: "El cursor de paginación no tiene el formato base64url(createdAtISO|id).",
    errors: [{ field: "cursor", code: "invalid_string", hint: "usa el nextCursor devuelto por el listado" }],
  });
  void raw; // el valor crudo NO se refleja en la respuesta (no se devuelve input).
  return new ApiProblem(problem);
}

/**
 * Condición Prisma del cursor para orden `createdAt DESC, id DESC`:
 * filtra todo lo anterior al cursor en ese orden (página siguiente).
 */
export function cursorWhere(
  cursor: { createdAt: Date; id: string } | undefined,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/** Orden Prisma del contrato transversal de listados (plan §3.1). */
export const CURSOR_ORDER = [{ createdAt: "desc" as const }, { id: "desc" as const }];
