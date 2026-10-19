# ADR-003 — Modelo de Web Workers: 1 worker por tipo de tarea, cancelable

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

Vectorización O(píxeles), eliminación de fondo O(píxeles×modelo) y empaquetado ZIP son bloqueantes si corren en el hilo principal: el lienzo debe seguir respondiendo <100 ms durante el cálculo. Además el usuario debe poder **cancelar** sin recargar.

## Decisión

- **Un worker por tipo de tarea** (`vectorizer.worker.ts`, `bg-removal.worker.ts`, `export.worker.ts`), instanciado perezosamente y reutilizado.
- Protocolo tipado de mensajes: `request → progress → success | error | cancelled`, con `jobId` para cancelaciones seguras.
- Transferables (`ArrayBuffer`, `ImageBitmap`) en ambos sentidos para no copiar píxeles.
- El modelo ONNX se descarga en el worker con consentimiento visible del usuario (aviso de tamaño).

## Consecuencias (coste)

- Código de orquestación (promesas + mapa de jobs) en el cliente.
- WASM/ONNX no se puede compartir entre workers por diseño; asumido (las tareas son secuenciales por naturaleza).

## Alternativas descartadas

- **Todo en el hilo principal:** congela la UI; incumple el listón (<100 ms).
- **Pool de N workers:** la vectorización de un proyecto es una tarea única del usuario; paralelizar sub-tareas añade complejidad real sin beneficio percibido (anti-sobreingeniería). El pool queda documentado como evolución si se añade procesado por lotes.
