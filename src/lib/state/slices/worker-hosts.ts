/**
 * VectorTinta — Hosts de los Web Workers (ADR-003 + §5.3).
 *
 * Estrategia de doble vía:
 *  1. PREFERENTE: Worker dedicado (módulo) instanciado con `new URL(...)`;
 *     el cálculo NO bloquea el hilo de UI (presupuesto <100 ms del lienzo).
 *  2. COMPATIBILIDAD: si el Worker no puede instanciarse/cargarse (entorno
 *     sin soporte o fallo de bundling), la MISMA función del pipeline corre
 *     en el hilo principal — el producto degrada en fluidez, no en función.
 *     El degradado queda anotado en el registro de diagnóstico del cliente.
 *
 * Contrato: UN job activo por tipo de worker (los slices guardan el estado
 * busy); jobId = crypto.randomUUID(); cancelación por AbortSignal → mensaje
 * `cancel` → terminal `cancelled`.
 */
"use client";

import { ApiProblem } from "@/lib/domain/errors";
import type { Problem } from "@/lib/domain/errors";
import type { BgRemovalResult, RawImageData, VectorParams, VectorizeResult } from "@/lib/domain/entities";
import type {
  BgRemovalOptions,
  BgRemovalWorkerRequest,
  BgRemovalWorkerResponse,
  ExportRequestPayload,
  ExportWorkerRequest,
  ExportWorkerResponse,
  VectorizerWorkerRequest,
  VectorizerWorkerResponse,
} from "@/lib/domain/worker-protocol";
import { runVectorization } from "@/lib/vectorizer/pipeline";
import { runBgRemoval } from "@/lib/bg-removal/pipeline";
import { zipSerigrafiaExporter } from "@/lib/exporter/formats/zip-serigrafia";

/** Cancelación de job (el usuario abortó): NO es un error de red ni HTTP. */
export class JobCancelled extends Error {
  constructor() {
    super("Operación cancelada");
    this.name = "JobCancelled";
  }
}

interface JobContext {
  onProgress?: (phase: string, percent: number) => void;
  signal?: AbortSignal;
}

type WorkerName = "vectorizer" | "bg-removal" | "export";

const workers = new Map<WorkerName, Worker | null>();
const degradadoAnotado = new Set<WorkerName>();

function getWorker(name: WorkerName, onDegraded: (reason: string) => void): Worker | null {
  if (workers.has(name)) return workers.get(name) ?? null;
  try {
    // PATRÓN DOCUMENTADO del bundler: `new Worker(new URL('<literal>', import.meta.url))`
    // EXACTO en el punto de creación — Turbopack/webpack solo transforman esta
    // forma (un helper que devuelva la URL NO se reescribe). Desde
    // src/lib/state/slices/ → ../../../workers/.
    const w =
      name === "vectorizer"
        ? new Worker(new URL("../../../workers/vectorizer.worker.ts", import.meta.url), { type: "module" })
        : name === "bg-removal"
          ? new Worker(new URL("../../../workers/bg-removal.worker.ts", import.meta.url), { type: "module" })
          : new Worker(new URL("../../../workers/export.worker.ts", import.meta.url), { type: "module" });
    workers.set(name, w);
    return w;
  } catch (e) {
    workers.set(name, null);
    if (!degradadoAnotado.has(name)) {
      degradadoAnotado.add(name);
      onDegraded(e instanceof Error ? e.message : String(e));
    }
    return null;
  }
}

async function runJob<TRes>(
  name: WorkerName,
  buildRequest: (jobId: string) => unknown,
  ctx: JobContext,
  fallback: () => TRes | Promise<TRes>,
  onDegraded: (reason: string) => void,
): Promise<TRes> {
  const worker = getWorker(name, onDegraded);
  if (worker === null) {
    return await fallback();
  }

  return await new Promise<TRes>((resolve, reject) => {
    const jobId = crypto.randomUUID();

    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      ctx.signal?.removeEventListener("abort", onAbort);
    };

    const onMessage = (ev: MessageEvent): void => {
      const msg = ev.data as { kind?: string; jobId?: string } | null;
      if (msg?.jobId !== jobId) return;
      if (msg.kind === "progress") {
        const p = msg as unknown as { phase: string; percent: number };
        ctx.onProgress?.(p.phase, p.percent);
      } else if (msg.kind === "success") {
        cleanup();
        resolve((msg as unknown as { result: TRes }).result);
      } else if (msg.kind === "error") {
        cleanup();
        reject(new ApiProblem((msg as unknown as { problem: Problem }).problem));
      } else if (msg.kind === "cancelled") {
        cleanup();
        reject(new JobCancelled());
      }
    };

    const onError = (ev: ErrorEvent): void => {
      cleanup();
      workers.set(name, null);
      if (!degradadoAnotado.has(name)) {
        degradadoAnotado.add(name);
        onDegraded(ev.message || `Fallo al cargar el worker ${name}`);
      }
      // Vía de compatibilidad: mismo cálculo en el hilo principal.
      Promise.resolve()
        .then(() => fallback())
        .then(resolve, reject);
    };

    const onAbort = (): void => {
      worker.postMessage({ kind: "cancel", jobId });
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    ctx.signal?.addEventListener("abort", onAbort);

    try {
      worker.postMessage(buildRequest(jobId));
    } catch (e) {
      cleanup();
      Promise.resolve()
        .then(() => fallback())
        .then(resolve, reject);
    }
  });
}

/* ────────────────────── Operaciones expuestas ────────────────────── */

export function runVectorizeJob(
  input: { imageData: RawImageData; params: VectorParams; engineId: string },
  ctx: JobContext = {},
  onDegraded: (reason: string) => void = () => undefined,
): Promise<VectorizeResult> {
  const imageData = { ...input.imageData, data: input.imageData.data.slice() };
  return runJob<VectorizeResult>(
    "vectorizer",
    (jobId): VectorizerWorkerRequest => ({
      kind: "request",
      jobId,
      imageData,
      params: input.params,
      presetId: "",
      engineId: input.engineId,
    }),
    ctx,
    () => runVectorization({ ...input, signal: ctx.signal, onProgress: ctx.onProgress }),
    onDegraded,
  );
}

export function runBgRemovalJob(
  input: { imageData: RawImageData; options: BgRemovalOptions; engineId: string },
  ctx: JobContext = {},
  onDegraded: (reason: string) => void = () => undefined,
): Promise<BgRemovalResult> {
  const imageData = { ...input.imageData, data: input.imageData.data.slice() };
  return runJob<BgRemovalResult>(
    "bg-removal",
    (jobId): BgRemovalWorkerRequest => ({
      kind: "request",
      jobId,
      imageData,
      options: input.options,
      engineId: input.engineId,
    }),
    ctx,
    () => runBgRemoval({ ...input, signal: ctx.signal, onProgress: ctx.onProgress }),
    onDegraded,
  );
}

/** ZIP serigráfico: solo formato 'zip-serigrafia' (el worker lo exige así). */
export async function runZipExportJob(
  payload: ExportRequestPayload,
  ctx: JobContext = {},
  onDegraded: (reason: string) => void = () => undefined,
): Promise<{ fileName: string; blobBytes: Uint8Array; manifestJson: string }> {
  return runJob<{ fileName: string; blobBytes: Uint8Array; manifestJson: string }>(
    "export",
    (jobId): ExportWorkerRequest => ({ kind: "request", jobId, payload }),
    ctx,
    () => zipSerigrafiaExporter.build({ payload }, { onProgress: ctx.onProgress }),
    onDegraded,
  );
}

export type { BgRemovalWorkerResponse, VectorizerWorkerResponse, ExportWorkerResponse };
