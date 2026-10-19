/**
 * VectorTinta — Adaptador `u2net-onnx` (ADR-009): STUB HONESTO DE BLOQUEO.
 *
 * La segmentación neuronal requiere: (a) la URL del modelo ONNX, que es
 * CONFIGURACIÓN (`NEXT_PUBLIC_BG_REMOVAL_MODEL_URL`, nombre leído de
 * `appConfig.bgRemoval.modelUrlEnvName` — única fuente); y (b) las
 * dependencias de inferencia (onnxruntime-web), NO incluidas en esta
 * iteración. No se inventa una inferencia que no existe: ambos caminos
 * terminan en un problema RFC 7807 de clase 'configuracion' con el nombre
 * EXACTO de la variable en el mensaje (failure-modes.md: el banner debe poder
 * citar la variable literal).
 */
import { appConfig } from "@/lib/config/app.config";
import { makeProblem } from "@/lib/domain/errors";
import { EngineFailure, type BackgroundRemovalEngine, type BgRemovalRunContext, type BgRemovalRunInput } from "../types";
import { readPublicEnv } from "../env";
import type { BgRemovalResult } from "@/lib/domain/entities";

export const u2netOnnxEngine: BackgroundRemovalEngine = {
  id: "u2net-onnx",
  metadata: {
    license: "pending-audit",
    description:
      "Segmentación saliente con red neuronal U²-Net compilada a ONNX (ADR-009). Requiere la URL del modelo por configuración y dependencias de inferencia no incluidas en esta iteración; mientras tanto queda bloqueado con un problema de clase CONFIG.",
  },
  remove(_input: BgRemovalRunInput, _options: { tolerance: number; feather: boolean }, _ctx: BgRemovalRunContext): BgRemovalResult {
    const envName = appConfig.bgRemoval.modelUrlEnvName; // 'NEXT_PUBLIC_BG_REMOVAL_MODEL_URL'
    const modelUrl = readPublicEnv(envName);
    if (modelUrl === undefined) {
      throw new EngineFailure(
        makeProblem("configuracion", {
          title: "Configuración incompleta",
          detail: `Falta la variable de entorno ${envName} para descargar el modelo de segmentación (ADR-009).`,
          errors: [{ code: "missing_env", env: envName }],
        }),
      );
    }
    throw new EngineFailure(
      makeProblem("configuracion", {
        title: "Motor externo no disponible",
        detail: "el motor u2net-onnx requiere dependencias de inferencia no incluidas en esta iteración",
        errors: [{ code: "engine_unavailable", resource: "u2net-onnx" }],
      }),
    );
  },
};
