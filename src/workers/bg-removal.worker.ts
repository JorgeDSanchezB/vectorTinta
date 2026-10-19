/// <reference lib="webworker" />
/**
 * VectorTinta — Worker de eliminación de fondo (ADR-003/ADR-009, protocolo de
 * domain/worker-protocol.ts).
 *
 * Mismo ciclo que el vectorizador: `request` → AbortController local → 0..n
 * `progress` ('sembrando' 5 % → 'rellenando' 5→80 % → 'suavizando' 80→100 %)
 * → terminal `success | error | cancelled` con el mismo jobId.
 *
 * Transferibles: en `success` el buffer de la máscara alfa
 * (`result.alphaMask.data.buffer`) viaja en la lista de transferencia para no
 * copiar W·H·4 bytes (ADR-003).
 */
import type { BgRemovalWorkerRequest, BgRemovalWorkerResponse } from "@/lib/domain/worker-protocol";
import { runBgRemoval } from "@/lib/bg-removal/pipeline";
import { EngineFailure, OperationCancelled } from "@/lib/bg-removal/types";
import { makeProblem, type Problem } from "@/lib/domain/errors";

const scope = self as unknown as DedicatedWorkerGlobalScope;

const jobs = new Map<string, AbortController>();

scope.addEventListener("message", (event: MessageEvent<BgRemovalWorkerRequest>): void => {
  const req = event.data;
  if (req.kind === "cancel") {
    jobs.get(req.jobId)?.abort();
    return;
  }
  if (req.kind !== "request") return;

  const controller = new AbortController();
  jobs.set(req.jobId, controller);
  try {
    const result = runBgRemoval({
      imageData: req.imageData,
      options: req.options,
      engineId: req.engineId,
      signal: controller.signal,
      onProgress: (phase, percent) => {
        scope.postMessage({ kind: "progress", jobId: req.jobId, phase, percent });
      },
    });
    const buffer = result.alphaMask.data.buffer as ArrayBuffer;
    scope.postMessage({ kind: "success", jobId: req.jobId, result }, [buffer]);
  } catch (e) {
    scope.postMessage(traducirError(e, req.jobId));
  } finally {
    jobs.delete(req.jobId);
  }
});

/** Traduce excepciones del pipeline al mensaje terminal del protocolo. */
function traducirError(e: unknown, jobId: string): BgRemovalWorkerResponse {
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
      title: "Fallo inesperado en el worker de eliminación de fondo",
      detail,
      errors: [{ code: "worker_crash" }],
    }),
  };
}
