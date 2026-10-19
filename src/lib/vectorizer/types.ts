/**
 * VectorTinta — Contratos del paquete de vectorización (plan §6.2, ADR-001).
 *
 * Este módulo es CLIENTE-SEGURO: corre dentro de `vectorizer.worker.ts`
 * (ADR-003), sin ninguna dependencia de servidor (nada de node:*, fs, process).
 *
 * El puerto `VectorizerEngine` tiene dos adaptadores registrados en el
 * pipeline: `imagetracer-js` (implementación propia, licencia 'audited-ok')
 * y `vtracer-wasm` (externo, bloqueado con licencia 'pending-audit' — el
 * adaptador es un stub honesto de bloqueo, no un motor falso).
 */
import type { RawImageData, VectorParams, VectorizeResult } from "@/lib/domain/entities";
import type { Problem } from "@/lib/domain/errors";

/** Entrada del motor: imagen RGBA cruda + params ya validados contra el esquema del preset (registro). */
export interface VectorizerRunInput {
  imageData: RawImageData;
  params: VectorParams;
}

/** Contexto de ejecución: cancelación cooperativa + informe de progreso por fases. */
export interface VectorizerRunContext {
  signal?: AbortSignal;
  onProgress?: (phase: string, percent: number) => void;
}

/**
 * Puerto del motor de vectorización (ADR-001).
 * `run` es síncrono y O(W·H): solo se ejecuta dentro del Worker dedicado.
 */
export interface VectorizerEngine {
  id: string;
  metadata: { license: "audited-ok" | "pending-audit"; description: string };
  run(input: VectorizerRunInput, ctx: VectorizerRunContext): VectorizeResult;
}

/**
 * Cancelación cooperativa: los pipelines la comprueban entre fases (y los
 * motores en sus bucles largos) y la relanzan tal cual. El Worker la traduce
 * a `{ kind: "cancelled", jobId }` — nunca a un error HTTP.
 */
export class OperationCancelled extends Error {
  readonly kind = "cancelled" as const;

  constructor(message = "Operación cancelada por el usuario") {
    super(message);
    this.name = "OperationCancelled";
  }
}

/**
 * Fallo de motor con problema RFC 7807 completo (errors.ts). El Worker la
 * traduce a `{ kind: "error", problem }`; el problema viaja serializable.
 */
export class EngineFailure extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "EngineFailure";
    this.problem = problem;
  }
}
