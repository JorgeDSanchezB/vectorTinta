/**
 * VectorTinta — Contratos del paquete de exportación (plan §6.2).
 *
 * Dos formatos registrados en appConfig → export.formats (ADR-008):
 *  - `zip-serigrafia`: un SVG por tinta + manifest.json; corre EN EL WORKER
 *    (fflate, puro bytes/strings).
 *  - `png-mockup`: composición plana para aprobar el arte; corre EN EL HILO
 *    PRINCIPAL (necesita rasterizar SVG con <img>/canvas).
 */
import type { ExportRequestPayload } from "@/lib/domain/worker-protocol";
import type { Problem } from "@/lib/domain/errors";

export interface ExporterInput {
  payload: ExportRequestPayload;
}

export interface ExporterOutput {
  fileName: string;
  blobBytes: Uint8Array;
  manifestJson: string;
}

/** Progreso por fases ('componiendo' | 'serializando' | 'comprimiendo' | 'rasterizando'…). */
export interface ExporterContext {
  onProgress?: (phase: string, percent: number) => void;
}

export interface Exporter {
  id: "zip-serigrafia" | "png-mockup";
  manifestSchemaVersion: number;
  build(input: ExporterInput, ctx?: ExporterContext): Promise<ExporterOutput> | ExporterOutput;
}

/** Fallo de exportación con problema RFC 7807 (serializable por postMessage). */
export class ExportFailure extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "ExportFailure";
    this.problem = problem;
  }
}

/** Ids de formato dados de alta en la configuración (orden estable del manifiesto). */
export const EXPORTER_FORMAT_IDS = ["zip-serigrafia", "png-mockup"] as const;
