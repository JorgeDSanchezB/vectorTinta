# ADR-009 — Eliminación de fondo ONNX en el cliente (puerto `BackgroundRemovalEngine`)

**Estado:** Aceptada (con bloqueo de licencia declarado) · Problema / coste / alternativa descartada.

## Contexto (problema)

El listón exige que la eliminación de fondo ocurra **en el navegador, sin subir la imagen a ningún servidor externo**, y que sea **reversible**. Las librerías conocidas: `@remove-background-ai` (sube a un API: incumple el listón) e `@imgly/background-removal` (ONNX en navegador: cumple el requisito técnico, PERO su licencia/condiciones de uso deben verificarse antes de producción — riesgo R-02). El modelo subyacente (U²-Net/ISNet) es Apache-2.0.

## Decisión

- Puerto `BackgroundRemovalEngine` con DOS adaptadores planificados:
  - `imgly` — marcado `license: 'pending-audit'`; es el adaptador por defecto en desarrollo mientras se audita su licencia de uso comercial.
  - `u2net-onnx` — port directo de U²-Net (Apache-2.0) con `onnxruntime-web`; **fallback sin riesgo legal**.
- Ejecución en `bg-removal.worker.ts`; el resultado es una **máscara alfa** (`ImageData`) que se guarda como parte del comando `RemoveBackgroundCommand` del historial ⇒ **reversibilidad por diseño** (undo restaura el alfa original).
- La URL del modelo es **configuración** (`NEXT_PUBLIC_BG_REMOVAL_MODEL_URL`); su ausencia produce un error de clase CONFIG con banner explicativo (failure-modes.md), nunca un fallo silencioso.
- Aviso previo de descarga del modelo (10–40 MiB) con consentimiento del usuario.

## Consecuencias (coste)

- Primera ejecución lenta (descarga + compilación WASM/ONNX); mitigado con aviso y cacheo del modelo (Cache API).
- Mantener dos adaptadores duplica pruebas de calidad de máscara (fixtures).

## Alternativas descartadas

- **API externa (@remove-background-ai):** sube la imagen a un tercero ⇒ incumple literalmente el listón y empeora privacidad/coste.
- **Solo `imgly` hardcodeado:** bloquearía la decisión de licencia; violaría la regla del carro.
- **Croma/umbral manual sin ML:** calidad insuficiente para fotos del mundo real; queda como estrategia adicional registrable (por tolerancia), no como sustituto.
