# ADR-004 — Estado: Zustand con slices + TanStack Query para servidor

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

El estado de la sesión de trabajo (selección, zoom, colores pendientes, historial undo/redo, diagnósticos) se actualiza con **alta frecuencia** y debe re-renderizar lo mínimo. El estado de servidor (proyectos, exportaciones) es caché de datos remotos con paginación por cursor.

## Decisión

- **Zustand** con 6 slices (`project`, `tool`, `history`, `export`, `diagnostics`, `auth`) y selectores finos por componente (`s => s.layersById.get(id)`).
- **TanStack Query** para TODO el estado de servidor (caché, reintentos, paginación infinita con cursor). Regla de frontera: Zustand nunca guarda datos de servidor sin espejar el estado de sincronización.
- Historial undo/redo con patrón Command dentro de Zustand (`historySlice`), sin librería externa.

## Consecuencias (coste)

- Disciplina: componentes que subscriben selectores finos; evitar `useStore()` sin selector.
- Dos fuentes de verdad potenciales (servidor/espejo local) mitigadas con el patrón "espejo + cambios pendientes + PATCH" descrito en 5.6.

## Alternativas descartadas

- **Redux Toolkit:** más boilerplate (actions/reducers/store), sin beneficio añadido a este tamaño; su middleware (thunk/saga) duplica lo que hace TanStack Query.
- **Context + useReducer:** re-renderiza árboles enteros; incumple <100 ms con listas grandes.
- **Jotai/Recoil:** átomos finos equivalentes; se descartan por preferir un único store devtools-friendly con slices.
