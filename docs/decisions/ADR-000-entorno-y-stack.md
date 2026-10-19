# ADR-000 — Entorno y stack de ejecución: Next.js 16 unificado frente a Vite + Fastify separados

**Estado:** Aceptada (iteración 1) · **Fecha:** 2025 · **Contexto de decisión obligatorio:** problema / coste / alternativa descartada.

## Contexto (problema)

El enunciado propone frontend Vite y backend Fastify con PostgreSQL y MinIO en Docker Compose. El entorno real de esta iteración es un sandbox que: (a) expone **un único puerto** hacia el exterior con un gateway (Caddy), (b) ya tiene inicializado un proyecto **Next.js 16** con App Router, Tailwind 4, shadcn/ui, Prisma y **SQLite** como cliente Prisma permitido, y (c) solo permite una ruta visible `/`. Desplegar Vite + Fastify como procesos independientes aquí no es posible sin romper las restricciones del entorno.

## Decisión

1. **Una sola aplicación Next.js 16**: la UI y la API viven en el mismo servicio; el backend son **Route Handlers** (`src/app/api/**/route.ts`).
2. **Puertos y adaptadores** para todo lo que el enunciado pide reemplazar: `StorageAdapter` (local FS ahora, S3/MinIO/R2 en producción), repositorio Prisma (SQLite ahora, PostgreSQL después), motores cliente (`VectorizerEngine`, `BackgroundRemovalEngine`).
3. La separación lógica del monorepo (`apps/web`, `apps/api`, `packages/*`) se conserva como **límites de módulo internos** (sección 1.9 del plan) para que la extracción futura a Fastify sea mecánica.
4. El enrutado público completo (`/proyectos/[id]`, etc.) se documenta; en sandbox la única página `/` conmuta vistas internas.

## Consecuencias (coste)

- La API no escala con independencia de la UI mientras vivamos en el sandbox (aceptable: el procesamiento pesado es 100 % cliente; el backend es I/O ligero).
- SQLite no soporta escrituras concurrentes elevadas; suficiente para demo/evaluación y declarado en riesgos (R-07).
- Una base de código unifica frontend y backend: disciplina de imports (`server-only` en módulos de servidor) para no filtrar secretos al cliente.

## Alternativas descartadas

- **Vite + Fastify en mini-servicios del sandbox:** viable técnicamente (el entorno soporta servicios en puertos internos con `XTransformPort`), pero añade fricción operativa (dos procesos que mantener, gateway) sin beneficio real en una iteración de **planificación**. Se documenta cómo sería la extracción (ADR-005, ADR-006).
- **Hexagonal completo con DI:** no justificado por el tamaño (ver ADR-008).
