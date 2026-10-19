# ADR-001 — Vectorización WASM en el cliente (puerto `VectorizerEngine`)

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

Vectorizar en servidor implica: subir imágenes de hasta 15 MiB (latencia), pagar cómputo por conversión y tratar con la imagen del cliente (privacidad, RGPD). El enunciado obliga a preferir el cliente. Además existe un **riesgo legal real**: las licencias de los motores conocidos son dispares (vtracer original es de licencia restrictiva; potrace es GPL; imagetracer.js es de dominio público/Unlicense).

## Decisión

- Puerto `VectorizerEngine` con DOS adaptadores planificados:
  - `vtracer-wasm` — mejor calidad en modo color; **marcado `license: 'pending-audit'`**: NO se adopta en producción sin verificación de licencia (riesgo R-01). Si la auditoría falla, se elimina el adaptador, no el producto.
  - `imagetracer` — fallback seguro (Unlicense/public domain), menor calidad, garantiza producto comercializable pase lo que pase.
- Ejecución SIEMPRE en `vectorizer.worker.ts` (Web Worker) con `AbortSignal`, progreso y `nodeCount` de retorno (para el límite de nodos).
- Presets y parámetros validados por esquema registrado (ADR-008); la elección de motor es un dato de la `Vectorization` (`engineId`) para trazabilidad de calidad.

## Consecuencias (coste)

- Bundle adicional ~1–2 MiB (carga perezosa solo al vectorizar).
- Memoria 2–4× el raster en el worker; el límite `maxPixels` de configuración protege el navegador.
- Mantener dos adaptadores duplica superficie de pruebas de calidad perceptual (fixtures/).

## Alternativas descartadas

- **Solo servidor (sharp + potrace):** coste por conversión, subida obligatoria, latencia y RGPD. Solo se reabriría si un motor de servidor fuera drásticamente mejor.
- **Un solo motor hardcodeado:** bloquearía la decisión de licencia y violaría la regla del carro.
