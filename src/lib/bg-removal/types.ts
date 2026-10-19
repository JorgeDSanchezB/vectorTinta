/**
 * VectorTinta — Contratos del paquete de eliminación de fondo (ADR-009).
 *
 * CLIENTE-SEGURO: corre dentro de `bg-removal.worker.ts` (ADR-003). El puerto
 * `BackgroundRemovalEngine` tiene dos adaptadores registrados en el pipeline:
 * `chroma-edge` (implementación propia por croma desde los bordes,
 * 'audited-ok') y `u2net-onnx` (segmentación neuronal, bloqueado honesto con
 * licencia 'pending-audit' + requisito de configuración).
 */
import type { BgRemovalResult, RawImageData } from "@/lib/domain/entities";
import type { BgRemovalOptions } from "@/lib/domain/worker-protocol";
import type { Problem } from "@/lib/domain/errors";

/** Entrada del motor: imagen RGBA cruda (nunca se muta; el resultado es una máscara nueva). */
export interface BgRemovalRunInput {
  imageData: RawImageData;
}

/** Contexto de ejecución: cancelación cooperativa + progreso por fases. */
export interface BgRemovalRunContext {
  signal?: AbortSignal;
  onProgress?: (phase: string, percent: number) => void;
}

/** Puerto del motor de eliminación de fondo (ADR-009). `remove` es síncrono y O(W·H). */
export interface BackgroundRemovalEngine {
  id: string;
  metadata: { license: "audited-ok" | "pending-audit"; description: string };
  remove(
    input: BgRemovalRunInput,
    options: BgRemovalOptions,
    ctx: BgRemovalRunContext,
  ): BgRemovalResult;
}

/**
 * Cancelación cooperativa (mismo convenio que el vectorizador): el Worker la
 * traduce a `{ kind: "cancelled", jobId }`.
 */
export class OperationCancelled extends Error {
  readonly kind = "cancelled" as const;

  constructor(message = "Operación cancelada por el usuario") {
    super(message);
    this.name = "OperationCancelled";
  }
}

/** Fallo de motor con problema RFC 7807 completo (serializable por postMessage). */
export class EngineFailure extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "EngineFailure";
    this.problem = problem;
  }
}
