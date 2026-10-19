# ADR-002 — Lienzo interactivo: SVG nativo frente a Konva.js/Fabric.js

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

El enunciado sugiere Konva o Fabric para el lienzo. El dato fundamental: el resultado de la vectorización **ya es SVG** (`<path>` por zona de color). Las operaciones críticas del listón son: seleccionar zona por clic, recolorear instantáneo (<100 ms) y exportar SVG por capa sin pérdida.

## Decisión

**SVG nativo interactivo** para v1:

- Hit-testing por zona = evento DOM `pointerdown` + `closest('[data-layer-id]')` (O(profundidad), nativo, accesible por defecto).
- Recoloreo = mutar `fill` del grupo (O(paths de la capa)); exportación = serializar el DOM existente (`XMLSerializer`) — cero conversión de formatos.
- Zoom/pan = mutación de `viewBox` (O(1), no re-renderiza capas).
- Accesibilidad: el SVG nativo permite `role`, `aria-label` por capa y navegación por foco, requisito del listón de calidad.

Konva queda documentado como **candidato de sustitución** para el visor del raster (antes de vectorizar) o herramientas de máscara tipo pincel — escenarios donde canvas gana. El lienzo vectorial no se mezcla con el raster.

## Consecuencias (coste)

- Rendimiento DOM con decenas de miles de nodos: mitigado por capas (≤ 30 por diseño de dominio), visibilidad `display="none"` sin desmontaje y filtro de speckle de los presets (reduce nodos).
- Debemos gestionar nosotros el viewBox y los eventos de rueda/arrastre (Konva los trae dados). Coste acotado y testable.

## Alternativas descartadas

- **Konva/Fabric:** convierte paths a escena de canvas ⇒ doble estado de la verdad (SVG de datos + escena), hit-test manual por geometría, exportación requiere reconstruir SVG, y accesibilidad de canvas es peor (atributos ARIA sobre elementos no semánticos). El coste supera al beneficio mientras el dato sea SVG.
- **WebGL (pixi):** absurdo para 30 capas de paths; se descarta por anti-sobreingeniería.
