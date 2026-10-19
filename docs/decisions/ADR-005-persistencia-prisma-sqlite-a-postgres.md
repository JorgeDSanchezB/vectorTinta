# ADR-005 — Persistencia: Prisma con SQLite (sandbox) → PostgreSQL 16 (producción)

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

El enunciado pide PostgreSQL + Prisma. El entorno solo permite el cliente Prisma de SQLite. Los datos del dominio son netamente **relacionales** (proyecto → assets → vectorización → capas; exportaciones; auditoría), con invariantes de unicidad compuesta (`Layer(vectorizationId, orden)`) que una base documental no garantiza nativamente.

## Decisión

- **Prisma** como ORM en ambas fases; el esquema se escribe **dialecto-agnóstico** (2.3 del plan) de modo que el paso a producción sea: `provider = "postgresql"` + `prisma migrate`. Los tipos usados (`String`, `Int`, `Boolean`, `DateTime`, `Json`) son válidos en ambos dialectos.
- En SQLite **no existen enums**: los campos enumerados (`plan`, `role`, `formatId`, `action`) son `String` validados por Zod en el borde HTTP (única puerta de entrada/salida). En PostgreSQL se podrán convertir a enums nativos en migración explícita, manteniendo Zod como capa de contrato.
- Migraciones: `prisma db push` en sandbox (schema-first); `prisma migrate dev/deploy` con historial en producción.

## Consecuencias (coste)

- SQLite: escritor único (WAL ayuda); sin ventanas de concurrencia alta. Declarado en riesgos (R-07): aceptable en demo, no en producción — precisamente por eso el plan de migración es explícito.
- `Json` en SQLite se materializa como texto; Prisma lo tipa igual. La validación por esquema registrado (Fase 4) es la barrera real de integridad.

## Alternativas descartadas

- **Mongoose/MongoDB:** sin invariantes relacionales nativas, sin JOIN para cursores; el dominio es relacional.
- **Drizzle/Kysely:** Prisma ya está integrado en el entorno y su capa de tipos cubre el contrato; cambiar ORM no aporta valor en esta iteración.
