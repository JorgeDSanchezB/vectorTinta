# ADR-006 — Almacenamiento de objetos: puerto `StorageAdapter` (local → S3/MinIO/R2)

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

Los binarios (raster origen, SVG resultado, fragmentos por capa, ZIPs de exportación, miniaturas) no pertenecen a la base relacional. El enunciado pide almacenamiento compatible S3 (MinIO local, R2/S3 en prod). El sandbox no tiene MinIO ni disco persistente garantizado más allá del proyecto.

## Decisión

- Puerto `StorageAdapter` con cuatro operaciones (`put`, `get`, `delete`, `sign`) — firma en 6.2 del plan.
- **Adaptador local** (sandbox): archivos bajo un raíz configurable (`STORAGE_ROOT`), claves opacas (uuid) sin extensión confiable, contenido servido SIEMPRE por streaming autorizado `GET /api/assets/:key` (nunca enlace directo al disco).
- **Adaptador S3** (producción): misma interfaz, URLs prefirmadas con TTL para descargas.
- Claves generadas por el servidor (`Asset.storageKey @unique`), nunca por el cliente, para evitar colisiones y path traversal.

## Consecuencias (coste)

- Una indirección más y un mapa clave→backend en los tests.
- `GET /api/assets/:key` añade un salto de latencia en sandbox; en producción se sirven URLs firmadas directas (el endpoint queda como fallback/privacidad).

## Alternativas descartadas

- **Binarios en la base (BLOB):** hincha la BD y rompe el modelo relacional; descartado salvo miniaturas (evaluable).
- **Disco local acoplado en el código del dominio:** inservible en producción (multiinstancia); viola la regla del carro a nivel de infraestructura.
