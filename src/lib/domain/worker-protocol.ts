/**
 * VectorTinta — Protocolo tipado de los Web Workers (plan §6.2).
 *
 * Módulo ISOMORFO compartido entre el host (cliente) y cada Worker.
 * Contrato: request con jobId → 0..n progress → UN terminal
 * (success | error | cancelled) con el mismo jobId. `error` transporta un
 * objeto Problem (RFC 7807) serializable, jamás un Error opaco.
 *
 * Transferables: los ImageData.data viajan como ArrayBuffer transferido;
 * el host SIEMPRE envía una copia (el original del estado no se detacha).
 */
import type { RawImageData, VectorParams, VectorizeResult, BgRemovalResult } from "@/lib/domain/entities";
import type { Problem } from "@/lib/domain/errors";

/* ─────────────────── Mensajes comunes ─────────────────── */

export interface WorkerProgress {
  kind: "progress";
  jobId: string;
  phase: string; // "cuantizando" | "filtrando" | "trazando" | "serializando" | "comprimiendo"…
  percent: number; // 0..100
}

export interface WorkerError {
  kind: "error";
  jobId: string;
  problem: Problem;
}

export interface WorkerCancelled {
  kind: "cancelled";
  jobId: string;
}

/* ─────────────────── Vectorizador ─────────────────── */

export type VectorizerWorkerRequest =
  | {
      kind: "request";
      jobId: string;
      imageData: RawImageData;
      params: VectorParams;
      presetId: string; // informativo: se registra en la Vectorization
      engineId: string; // 'imagetracer-js' | 'vtracer-wasm' (registro de engines)
    }
  | { kind: "cancel"; jobId: string };

export type VectorizerWorkerResponse =
  | WorkerProgress
  | { kind: "success"; jobId: string; result: VectorizeResult }
  | WorkerError
  | WorkerCancelled;

/* ─────────────────── Eliminación de fondo ─────────────────── */

export interface BgRemovalOptions {
  tolerance: number; // 0..100 (similitud cromática desde el borde)
  feather: boolean; // suavizado de 1 px en el borde de la máscara
}

export type BgRemovalWorkerRequest =
  | {
      kind: "request";
      jobId: string;
      imageData: RawImageData;
      options: BgRemovalOptions;
      engineId: string; // 'chroma-edge' | 'u2net-onnx' (registro de operaciones)
    }
  | { kind: "cancel"; jobId: string };

export type BgRemovalWorkerResponse =
  | WorkerProgress
  | { kind: "success"; jobId: string; result: BgRemovalResult }
  | WorkerError
  | WorkerCancelled;

/* ─────────────────── Exportación ─────────────────── */

/** Capa lista para exportar (espejo del estado del cliente; sin id → con id). */
export interface ExportLayerInput {
  layerId: string;
  orden: number; // orden de apilado en la vectorización
  colorHex: string;
  name: string;
  areaPx: number;
  visible: boolean;
  fragmentSvg: string;
}

export interface ExportRequestPayload {
  formatId: "zip-serigrafia" | "png-mockup"; // ids de app.config → export.formats
  projectId: string;
  layers: ExportLayerInput[];
  canvasSize: { width: number; height: number }; // de la imagen fuente (áreas → %)
  source: { presetId: string; engineId: string; assetId: string };
}

/** Resultado del ZIP serigráfico (blob + manifest ya validado contra el registro). */
export interface ZipExportResult {
  fileName: string; // p. ej. "vectortinta-proyecto.zip"
  blobBytes: Uint8Array; // bytes del ZIP (transferido de vuelta)
  manifestJson: string; // serializado y firmado por el esquema del formato
}

/** Resultado del mockup PNG (composición plana para aprobar el arte). */
export interface MockupExportResult {
  fileName: string;
  blobBytes: Uint8Array;
  manifestJson: string;
  width: number;
  height: number;
}

export type ExportWorkerRequest =
  | { kind: "request"; jobId: string; payload: ExportRequestPayload }
  | { kind: "cancel"; jobId: string };

export type ExportWorkerResponse =
  | WorkerProgress
  | { kind: "success"; jobId: string; result: ZipExportResult | MockupExportResult }
  | WorkerError
  | WorkerCancelled;
