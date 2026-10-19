/// <reference lib="webworker" />
/**
 * VectorTinta — Worker de vectorización (ADR-003, protocolo de
 * domain/worker-protocol.ts).
 *
 * Ciclo por job: `request` → crea un AbortController local (el mapa de jobs
 * traduce `cancel` → abort) → 0..n `progress` → UN terminal `success |
 * error | cancelled` con el MISMO jobId. Los errores viajan SIEMPRE como
 * objeto Problem RFC 7807 serializable, nunca como Error opaco.
 *
 * Nota de runtime (documentada en worklog): el motor es síncrono (contrato
 * del puerto), así que el Worker procesa `cancel` en cuanto su bucle de
 * eventos queda libre; el host puede además ignorar el success de un job ya
 * cancelado. La comprobación del signal es cooperativa: entre fases y dentro
 * de los bucles largos (cada 2^16 píxeles).
 *
 * Transferibles: el resultado es string + objetos (no hace falta transfer);
 * el ImageData entrante llega como copia y NO se transfiere de vuelta.
 */
import type { VectorizerWorkerRequest, VectorizerWorkerResponse } from "@/lib/domain/worker-protocol";
import { runVectorization } from "@/lib/vectorizer/pipeline";
import { EngineFailure, OperationCancelled } from "@/lib/vectorizer/types";
import { makeProblem, type Problem } from "@/lib/domain/errors";

/** Ámbito tipado del worker (sin `onmessage =` global ambiguo). */
const scope = self as unknown as DedicatedWorkerGlobalScope;

const jobs = new Map<string, AbortController>();

scope.addEventListener("message", (event: MessageEvent<VectorizerWorkerRequest>): void => {
  const req = event.data;
  if (req.kind === "cancel") {
    jobs.get(req.jobId)?.abort();
    return;
  }
  if (req.kind !== "request") return;

  const controller = new AbortController();
  jobs.set(req.jobId, controller);
  try {
    const result = runVectorization({
      imageData: req.imageData,
      params: req.params,
      engineId: req.engineId,
      signal: controller.signal,
      onProgress: (phase, percent) => {
        scope.postMessage({ kind: "progress", jobId: req.jobId, phase, percent });
      },
    });
    scope.postMessage({ kind: "success", jobId: req.jobId, result });
  } catch (e) {
    scope.postMessage(traducirError(e, req.jobId));
  } finally {
    jobs.delete(req.jobId);
  }
});

/** Traduce excepciones del pipeline al mensaje terminal del protocolo. */
function traducirError(e: unknown, jobId: string): VectorizerWorkerResponse {
  if (e instanceof OperationCancelled || (e as { kind?: string } | null)?.kind === "cancelled") {
    return { kind: "cancelled", jobId };
  }
  if (e instanceof EngineFailure && e.problem !== undefined) {
    return { kind: "error", jobId, problem: e.problem };
  }
  const problem = (e as { problem?: unknown } | null)?.problem;
  if (
    typeof problem === "object" &&
    problem !== null &&
    "type" in problem &&
    "title" in problem &&
    "status" in problem
  ) {
    return { kind: "error", jobId, problem: problem as Problem };
  }
  const detail = e instanceof Error ? e.message : String(e);
  return {
    kind: "error",
    jobId,
    problem: makeProblem("interno", {
      title: "Fallo inesperado en el worker de vectorización",
      detail,
      errors: [{ code: "worker_crash" }],
    }),
  };
}
