/**
 * VectorTinta — Adaptador `vtracer-wasm` (ADR-001): STUB HONESTO DE BLOQUEO.
 *
 * El motor externo vtracer-wasm tiene licencia PENDIENTE DE AUDITORÍA (riesgo
 * legal R-01 del plan): no se adopta en producción sin verificación y NO se
 * incluye una implementación que finja vectorizar. `run` siempre lanza un
 * problema RFC 7807 de clase CONFIG con `engine_blocked`, apuntando al motor
 * propio `imagetracer-js` (audited-ok) como alternativa disponible hoy.
 */
import { makeProblem } from "@/lib/domain/errors";
import { EngineFailure, type VectorizerEngine, type VectorizerRunContext, type VectorizerRunInput } from "../types";
import type { VectorizeResult } from "@/lib/domain/entities";

export const vtracerWasmEngine: VectorizerEngine = {
  id: "vtracer-wasm",
  metadata: {
    license: "pending-audit",
    description:
      "Motor externo de trazado con curvas (WASM). BLOQUEADO: su licencia está pendiente de auditoría (ADR-001, riesgo R-01) y no se distribuye ni se ejecuta hasta que la auditoría la apruebe. Usa el motor propio imagetracer-js.",
  },
  run(_input: VectorizerRunInput, _ctx: VectorizerRunContext): VectorizeResult {
    throw new EngineFailure(
      makeProblem("configuracion", {
        title: "Motor externo no disponible",
        detail: "vtracer-wasm está bloqueado con licencia pendiente de auditoría; usa el motor propio imagetracer-js.",
        errors: [{ code: "engine_blocked", resource: "vtracer-wasm", supportedEngines: ["imagetracer-js"] }],
      }),
    );
  },
};
