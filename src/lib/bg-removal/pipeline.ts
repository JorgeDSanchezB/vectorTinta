/**
 * VectorTinta — Pipeline de eliminación de fondo (ADR-009/ADR-003).
 *
 * Mismo patrón que el vectorizador: mapa id→engine, validación de las
 * OPCIONES contra el esquema del OperationRegistry del engine pedido
 * (ADR-008), cancelación cooperativa y envoltura de fallos no clasificados en
 * problemas 'interno'. Fases de progreso: 'sembrando' 5 % → 'rellenando'
 * 5→80 % → 'suavizando' 80→100 %.
 */
import type { BgRemovalResult, RawImageData } from "@/lib/domain/entities";
import { makeProblem } from "@/lib/domain/errors";
import type { BgRemovalOptions } from "@/lib/domain/worker-protocol";
import { ChromaEdgeOptionsSchema, U2netOnnxOptionsSchema } from "@/lib/registries/operation-registry";
import type { z } from "zod";
import { EngineFailure, OperationCancelled, type BackgroundRemovalEngine } from "./types";
import { chromaEdgeEngine } from "./engines/chroma-edge";
import { u2netOnnxEngine } from "./engines/u2net-onnx";

/** Registro de engines disponibles (orden estable = orden de inserción). */
const ENGINES: ReadonlyMap<string, BackgroundRemovalEngine> = new Map<string, BackgroundRemovalEngine>([
  ["chroma-edge", chromaEdgeEngine],
  ["u2net-onnx", u2netOnnxEngine],
]);

/** Ids soportados por el pipeline (orden estable). */
export const SUPPORTED_BG_REMOVAL_ENGINES: readonly string[] = [...ENGINES.keys()];

/** Esquema de opciones por engine (OperationRegistry es la única fuente de cotas). */
const OPTION_SCHEMAS: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  ["chroma-edge", ChromaEdgeOptionsSchema],
  ["u2net-onnx", U2netOnnxOptionsSchema],
]);

export interface RunBgRemovalInput {
  imageData: RawImageData;
  options: BgRemovalOptions;
  engineId: string;
  signal?: AbortSignal;
  onProgress?: (phase: string, percent: number) => void;
}

/**
 * Ejecuta la eliminación de fondo sobre un engine registrado.
 * Lanza `OperationCancelled` o `EngineFailure` con el problema RFC 7807
 * exacto (engine desconocido → 'configuracion' enumerable; opciones inválidas
 * → 'validacion'; fallo interno → 'interno').
 */
export function runBgRemoval(input: RunBgRemovalInput): BgRemovalResult {
  const engine = ENGINES.get(input.engineId);
  if (engine === undefined) {
    throw new EngineFailure(
      makeProblem("configuracion", {
        title: "Motor de eliminación de fondo desconocido",
        detail: `Motor "${input.engineId}" no registrado. Motores soportados: ${SUPPORTED_BG_REMOVAL_ENGINES.join(", ")}.`,
        errors: [{ code: "unknown_engine", field: "engineId" }],
        supportedEngines: [...SUPPORTED_BG_REMOVAL_ENGINES],
      }),
    );
  }

  // Frontera del Worker: las opciones se validan contra el esquema del
  // OperationRegistry del propio engine (tolerance 0..100, feather boolean).
  const schema = OPTION_SCHEMAS.get(input.engineId);
  if (schema !== undefined) {
    const parsed = schema.safeParse(input.options);
    if (!parsed.success) {
      throw new EngineFailure(
        makeProblem("validacion", {
          title: "Opciones de eliminación de fondo inválidas",
          detail: "Las opciones no superan el esquema del OperationRegistry para este motor.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.map(String).join(".") || "options",
            code: issue.code,
          })),
        }),
      );
    }
  }

  if (input.signal?.aborted) throw new OperationCancelled();

  try {
    return engine.remove(
      { imageData: input.imageData },
      input.options,
      { signal: input.signal, onProgress: input.onProgress },
    );
  } catch (e) {
    if (e instanceof OperationCancelled) throw e;
    if (e instanceof EngineFailure) throw e;
    if ((e as { kind?: string } | null)?.kind === "cancelled") throw e;
    const detail = e instanceof Error ? e.message : String(e);
    throw new EngineFailure(
      makeProblem("interno", {
        title: "Fallo del motor de eliminación de fondo",
        detail: `El motor "${input.engineId}" falló de forma no clasificada: ${detail}`,
        errors: [{ code: "engine_crash", engine: input.engineId }],
      }),
    );
  }
}
