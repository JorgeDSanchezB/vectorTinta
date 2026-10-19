/// <reference lib="webworker" />
/**
 * VectorTinta — Worker de exportación (ADR-003, protocolo de
 * domain/worker-protocol.ts).
 *
 * SOLO construye el formato `zip-serigrafia` (fflate: puro bytes/strings).
 * El formato `png-mockup` se compone en el HILO PRINCIPAL (necesita <img>/
 * canvas/DOMParser para rasterizar): si llega aquí, se responde con un
 * problema 'validacion' y detail literal 'png-mockup se compone en el hilo
 * principal'. Los formatos desconocidos reciben el problema enumerable con
 * la lista soportada (plan §4.3).
 *
 * Transferibles: en `success` los bytes del ZIP (`blobBytes.buffer`) viajan
 * en la lista de transferencia (ADR-003).
 */
import type { ExportWorkerRequest, ExportWorkerResponse } from "@/lib/domain/worker-protocol";
import { makeProblem, type Problem } from "@/lib/domain/errors";
import { ExportFailure, EXPORTER_FORMAT_IDS } from "@/lib/exporter/types";
import { zipSerigrafiaExporter } from "@/lib/exporter/formats/zip-serigrafia";

const scope = self as unknown as DedicatedWorkerGlobalScope;

const jobs = new Map<string, AbortController>();

scope.addEventListener("message", (event: MessageEvent<ExportWorkerRequest>): void => {
  const req = event.data;
  if (req.kind === "cancel") {
    jobs.get(req.jobId)?.abort();
    return;
  }
  if (req.kind !== "request") return;

  void gestionarRequest(req);
});

async function gestionarRequest(req: Extract<ExportWorkerRequest, { kind: "request" }>): Promise<void> {
  const controller = new AbortController();
  jobs.set(req.jobId, controller);

  const responde = (msg: ExportWorkerResponse, transfer?: ArrayBuffer[]): void => {
    if (transfer !== undefined) scope.postMessage(msg, transfer);
    else scope.postMessage(msg);
  };

  if (req.payload.formatId === "png-mockup") {
    jobs.delete(req.jobId);
    responde({
      kind: "error",
      jobId: req.jobId,
      problem: makeProblem("validacion", {
        title: "Formato no soportado en el worker",
        detail: "png-mockup se compone en el hilo principal",
        errors: [{ code: "formato_hilo_principal", field: "formatId" }],
      }),
    });
    return;
  }
  if (req.payload.formatId !== "zip-serigrafia") {
    jobs.delete(req.jobId);
    responde({
      kind: "error",
      jobId: req.jobId,
      problem: makeProblem("validacion", {
        title: "Formato de exportación desconocido",
        detail: `Formato "${req.payload.formatId}" no registrado. Formatos soportados: ${EXPORTER_FORMAT_IDS.join(", ")}.`,
        errors: [{ code: "unknown_format", field: "formatId" }],
        supportedFormats: [...EXPORTER_FORMAT_IDS],
      }),
    });
    return;
  }

  try {
    // La construcción del ZIP es breve; la cancelación se materializa si el
    // 'cancel' llegó antes de empezar (o el host ignora el success tardío).
    if (controller.signal.aborted) {
      scope.postMessage({ kind: "cancelled", jobId: req.jobId });
      return;
    }
    // El puerto admite exportadores asíncronos; el de ZIP es síncrono, pero
    // se espera igualmente para respetar el contrato del `Exporter`.
    const result = await zipSerigrafiaExporter.build(
      { payload: req.payload },
      {
        onProgress: (phase, percent) => {
          scope.postMessage({ kind: "progress", jobId: req.jobId, phase, percent });
        },
      },
    );
    const buffer = result.blobBytes.buffer as ArrayBuffer;
    responde({ kind: "success", jobId: req.jobId, result }, [buffer]);
  } catch (e) {
    responde(traducirError(e, req.jobId));
  } finally {
    jobs.delete(req.jobId);
  }
}

/** Traduce excepciones del exportador al mensaje terminal del protocolo. */
function traducirError(e: unknown, jobId: string): ExportWorkerResponse {
  if ((e as { kind?: string } | null)?.kind === "cancelled") {
    return { kind: "cancelled", jobId };
  }
  if (e instanceof ExportFailure && e.problem !== undefined) {
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
      title: "Fallo inesperado en el worker de exportación",
      detail,
      errors: [{ code: "worker_crash" }],
    }),
  };
}
