/**
 * VectorTinta — Pipeline de vectorización (ADR-001/ADR-003).
 *
 * Orquestación CLIENTE-SEGURO (Worker): mapa id→engine, validación de params
 * contra el esquema común de presets (registro, ADR-008), cancelación
 * cooperativa por AbortSignal y envoltura de fallos no clasificados en
 * problemas RFC 7807 'interno'. Los problemas 'configuracion' que emiten los
 * motores (p. ej. el bloqueo honesto de vtracer-wasm) viajan tal cual.
 */
import type { RawImageData, VectorParams, VectorizeResult } from "@/lib/domain/entities";
import { VECTOR_ENGINE_IDS } from "@/lib/domain/entities";
import { makeProblem } from "@/lib/domain/errors";
import { CommonVectorParamsSchema } from "@/lib/registries/presets/common";
import { EngineFailure, OperationCancelled, type VectorizerEngine } from "./types";
import { imagetracerEngine } from "./engines/imagetracer-js";
import { vtracerWasmEngine } from "./engines/vtracer-wasm";

/** Registro de engines disponibles (orden estable = orden de inserción). */
const ENGINES: ReadonlyMap<string, VectorizerEngine> = new Map<string, VectorizerEngine>([
  ["imagetracer-js", imagetracerEngine],
  ["vtracer-wasm", vtracerWasmEngine],
]);

/** Ids soportados (re-export del contrato compartido para el consumidor del pipeline). */
export const SUPPORTED_VECTORIZER_ENGINES: readonly string[] = VECTOR_ENGINE_IDS;

export interface RunVectorizationInput {
  imageData: RawImageData;
  params: VectorParams;
  engineId: string;
  signal?: AbortSignal;
  onProgress?: (phase: string, percent: number) => void;
}

/**
 * Ejecuta la vectorización completa sobre un engine registrado.
 * Lanza `OperationCancelled` (señal abortada), o `EngineFailure` con el
 * problema RFC 7807 exacto (motor desconocido → 'configuracion' enumerable
 * con supportedEngines; params inválidos → 'params-invalidos'; fallo interno
 * del motor → 'interno').
 */
export function runVectorization(input: RunVectorizationInput): VectorizeResult {
  const engine = ENGINES.get(input.engineId);
  if (engine === undefined) {
    throw new EngineFailure(
      makeProblem("configuracion", {
        title: "Motor de vectorización desconocido",
        detail: `Motor "${input.engineId}" no registrado. Motores soportados: ${SUPPORTED_VECTORIZER_ENGINES.join(", ")}.`,
        errors: [{ code: "unknown_engine", field: "engineId" }],
        supportedEngines: [...SUPPORTED_VECTORIZER_ENGINES],
      }),
    );
  }

  // Los params se validan contra el esquema común del registro (ADR-008):
  // el pipeline es la frontera del Worker y no confía en el emisor.
  const parsed = CommonVectorParamsSchema.safeParse(input.params);
  if (!parsed.success) {
    throw new EngineFailure(
      makeProblem("params-invalidos", {
        title: "Parámetros de vectorización inválidos",
        detail: "Los params no superan el esquema común de los presets (rangos y campos del registro).",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "params",
          code: issue.code,
        })),
      }),
    );
  }

  if (input.signal?.aborted) throw new OperationCancelled();

  try {
    return engine.run(
      { imageData: input.imageData, params: parsed.data },
      { signal: input.signal, onProgress: input.onProgress },
    );
  } catch (e) {
    if (e instanceof OperationCancelled) throw e;
    if (e instanceof EngineFailure) throw e;
    if ((e as { kind?: string } | null)?.kind === "cancelled") throw e;
    const detail = e instanceof Error ? e.message : String(e);
    throw new EngineFailure(
      makeProblem("interno", {
        title: "Fallo del motor de vectorización",
        detail: `El motor "${input.engineId}" falló de forma no clasificada: ${detail}`,
        errors: [{ code: "engine_crash", engine: input.engineId }],
      }),
    );
  }
}
