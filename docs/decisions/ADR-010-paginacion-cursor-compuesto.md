# ADR-010 — Paginación por cursor compuesto (createdAt, id) en todos los listados

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

Un usuario puede acumular 500 proyectos y un proyecto 30 capas y N exportaciones; el listón exige que TODO listado funcione con n grande. `OFFSET/LIMIT` salta filas cuando hay escrituras concurrentes (página 2 puede repetir o perder elementos) y degrada a O(n) en profundidad.

## Decisión

- Cursor opaco: `base64url(isoCreatedAt + "|" + id)`; orden estable `createdAt DESC, id DESC`.
- Query Prisma con `OR: [{ createdAt: lt c }, { createdAt: eq c, id: lt id }]` + `take: limit + 1` + `select` explícito de columnas.
- Índices compuestos exactos `(ownerId|projectId, createdAt, id)` por cada listado (2.5 del plan).
- Contrato uniforme: `?limit=` (default 20, máx 100 en config) y `?cursor=`; respuesta `{ items, nextCursor, hasMore }`. `nextCursor: null` marca fin.

## Consecuencias (coste)

- Codificación/decodificación y validación del cursor (helper `http/cursor.ts`).
- No se puede saltar a "página 5": irrelevante para las UIs previstas (drawer virtualizado con "cargar más").

## Alternativas descartadas

- **OFFSET/LIMIT:** inestable con concurrencia y O(offset).
- **Cursor por id monotónico puro:** requiere contador global/ULID y no ordena por recencia de forma natural; el compuesto (createdAt,id) es el mínimo que garantiza orden + estabilidad con UUID.
- **Paginación por keyset en DB sin índice compuesto:** degrada a scan; por eso el índice es parte de la decisión.
