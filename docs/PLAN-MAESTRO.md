# VectorTinta — Plan Maestro de Producto y Arquitectura

**Versión:** 1.0 · **Iteración:** 1 (SOLO PLANIFICACIÓN) — **Iteración 2 (Fase 6) IMPLEMENTADA**: ver «Estado»
**Estado (Iteración 2):** la Fase 6 está **implementada y verificada en runtime** (navegador real, flujo dorado completo). El espacio de trabajo es la ruta `/`; la especificación sigue accesible como overlay («Especificación» en el pie). Las desviaciones conscientes sobre los contratos canónicos de §3.3 están documentadas una a una en `docs/decisions/ADR-012-deltas-implementacion.md`; el acceso de invitado en `ADR-011`.
**Idioma:** castellano. **Convención de fechas:** ISO-8601, zona horaria del taller (configurable).

---

## 0. Resumen ejecutivo

**VectorTinta** es un estudio web para talleres de serigrafía y diseñadores gráficos que transforma una imagen raster (JPG/PNG/WebP) en un SVG vectorial editable y, desde ahí, permite: eliminar el fondo en el navegador, recolorear por zonas, separar en capas por color plano y preparar la exportación serigráfica (un SVG por tinta + `manifest.json` con el orden de impresión, empaquetados en ZIP).

El procesamiento pesado (vectorización WASM, eliminación de fondo ONNX, empaquetado ZIP) se ejecuta **íntegramente en el cliente** dentro de Web Workers: la imagen original no viaja a ningún servidor para ser procesada. El backend se limita a persistencia, autenticación, cuotas, listados paginados y trazabilidad.

**Decisión de entorno (resumida, ver ADR-000):** el enunciado plantea Vite+Fastify+PostgreSQL+MinIO. El entorno de ejecución real de esta iteración es un único servicio Next.js 16 con un solo puerto expuesto, Prisma y SQLite. La arquitectura se diseña con **puertos y adaptadores** (interfaces `StorageAdapter`, `VectorizerEngine`, `BackgroundRemovalEngine`, `Exporter`, repositorios) de modo que el paso a PostgreSQL/S3/Fastify sea sustitución de adaptador, no rediseño. Cada desviación del stack propuesto está justificada con formato *problema / coste / alternativa descartada* en `docs/decisions/`.

**Índice de fases:**

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Plan estratégico | ✅ Completada |
| 2 | Modelado de datos | ✅ Completada |
| 3 | Contratos API | ✅ Completada |
| 4 | Lógica de inserción extensible | ✅ Completada |
| 5 | Renderizado dinámico y listas | ✅ Completada |
| 6 | Código fuente | ✅ Implementada (Iteración 2) y verificada en navegador |
| — | Informe del Árbitro | Se anexa al final de la iteración con datos reales de la pasada adversarial |

---

## 1. 🏗️ Fase 1 — Plan Estratégico

### 1.1 Objetivo y alcance

**Objetivo de producto.** Que un diseñador o un taller de estampación pase de “tengo un JPG del cliente” a “tengo mis fotolistos separados por tinta” sin abrir Illustrator ni instalar nada. Nivel de ambición del listón: herramienta que un profesional pagaría 20 €/mes sin dudar.

**Dentro del alcance (v1):**
1. Cargar imagen raster (JPG/PNG/WebP) con validación de límites (píxeles, bytes, MIME) — límites en configuración, no en código.
2. Vectorizar con **presets** (baja/media/alta) + parámetros avanzados validados por esquema (Fase 4).
3. Eliminar fondo **en el navegador** (ONNX en Web Worker) con reversibilidad (undo).
4. Recolorear zonas/capas sobre el lienzo con previsualización instantánea y undo/redo.
5. Separar en capas por color plano; renombrar, reordenar, ocultar, aislar.
6. Vista **Preparación de tintas**: por capa, color (HEX + nombre), área cubierta (px y %), marca de tinta única y orden de impresión.
7. Exportación serigráfica: ZIP con un SVG por capa + `manifest.json` (orden de impresión, colores, áreas, checksums) + exportadores adicionales registrables (mockup PNG, PDF por capa en el futuro).
8. Persistencia de proyecto: origen, parámetros, capas, colores y exportaciones; recuperación tras recarga.
9. Listado de proyectos del usuario paginado por cursor.

**Fuera del alcance (v1, documentado para no inflar):**
- Colaboración multiusuario en tiempo real (el backend la habilita por diseño — `ownerId` + `AuditEvent` — pero no hay UI en v1; se declara explícitamente).
- Edición de nodos Bézier manual (no es un editor vectorial generalista: es un preparador serigráfico).
- Modo móvil avanzado: en móvil se advierte la degradación (banner de rendimiento) y se permiten solo consulta y exportación ligera; la edición pesada se declara experiencia de escritorio (supuesto S-03).

### 1.2 Actores y casos de uso principales

| Actor | Descripción | Casos de uso |
|---|---|---|
| **Diseñador gráfico** | Prepara arte final del cliente | UC-1 vectorizar con preset; UC-3 recolorear por zona; UC-5 exportar SVG por capa; UC-7 persistir y recuperar proyecto |
| **Operario de taller** | Prepara pantallas y tintas | UC-4 separar por color; UC-6 vista de tintas con HEX, área y orden; UC-8 imprimir manifest/ZIP |
| **Cuentas del plan** | Usuario autenticado con cuota | UC-9 gestionar proyectos (listado paginado, renombrar, borrar); UC-10 respetar/consultar cuota |
| **Visitante evaluador** | Prueba sin registro | Modo local (todo en cliente, sin persistir); banner informativo; sin datos personales |

### 1.3 Supuestos (numerados; si se rompen, se reabre el plan)

- **S-01** Imágenes de entrada ≤ 4096×4096 px y ≤ 25 MiB (valores por defecto **configurables**, ver `app.config.ts`; revisado en ADR-013: lo que excede se ADAPTA automáticamente en el navegador — escala + recodificación — en lugar de rechazarse). El 95 % de artes para serigrafía cabe holgado.
- **S-02** Navegadores de escritorio actuales con WASM, Web Workers y `OffscreenCanvas` (Chromium/WebKit/Firefox de los últimos 24 meses).
- **S-03** La edición de calidad es experiencia de escritorio; móvil = consulta + avisos.
- **S-04** Un proyecto = un arte final; máximo 30 capas por vectorización y 20 proyectos por usuario gratuito (configurables).
- **S-05** Las capas se derivan de colores planos del resultado vectorial; no hay detección semántica de “objetos”.
- **S-06** El cliente es fiable para los metadatos declarativos (dimensiones, checksum) y el servidor los revalida parcialmente (bytes, MIME); el sondeo de píxeles en servidor queda como endurecimiento de producción (ver 3.x).
- **S-07** No se procesa PII en las imágenes; la imagen pertenece al proyecto del usuario y no se usa para nada más.

### 1.4 Riesgos y mitigaciones

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | **Licencias del motor WASM** (vtracer: licencia original restrictiva; ports npm con licencias dispares; potrace: GPL) | Media | Alto (bloquea producto comercial) | `VectorizerEngine` como puerto con 2 adaptadores: `vtracer-wasm` (pendiente de auditoría de licencia, marcado en el propio archivo) e `imagetracer.js` (dominio público/Unlicense, fallback seguro). Decisión bloqueante documentada; **no** se elige licencia sin verificación real. Ver ADR-001. |
| R-02 | **Licencia del modelo/bg-removal** (`@imgly/background-removal` tiene condiciones de uso propias; el modelo subyacente ISNet/U²-Net pesa Apache-2.0) | Media | Alto | Puerto `BackgroundRemovalEngine`; adaptador `imgly` marcado “verificar licencia antes de producción”; alternativa documentada: port ONNX de U²-Net con `onnxruntime-web` (Apache-2.0). Ver ADR-009. |
| R-03 | **Calidad perceptual del SVG** insuficiente en fotos | Media | Alto | Presets por caso de uso + métrica objetivo SSIM ≥ 0,92 con fixtures reproducibles (`docs/fixtures/`), umbral y protocolo documentados; inspección visual del árbitro en implementación. |
| R-04 | Rendimiento/memoria en imágenes grandes (WASM + ONNX) | Media | Medio | Límite de píxeles configurable; Workers cancelables; presupuesto <100 ms por interacción (5.3); degradación explícita, nunca cuelgue silencioso. |
| R-05 | Móvil/tableta lento con WASM | Alta | Medio | S-03: banner de degradación + bloqueo de operaciones O(píxeles) en pantallas pequeñas (configuración `limits.mobile`). |
| R-06 | Abuso de cuota/almacenamiento | Media | Medio | Cuotas por configuración + rate limiting + `AuditEvent` para trazabilidad. |
| R-07 | SQLite con escrituras concurrentes en sandbox | Baja | Bajo (solo demo) | ADR-005: SQLite solo para esta iteración; el esquema es dialecto-agnóstico y el salto a PostgreSQL es cambio de `provider` + migraciones. |
| R-08 | Falta de entorno de ejecución del producto en esta iteración | Cierta | Medio | Honestidad epistémica: verificación estática del diseño + protocolos de verificación reproducibles por punto del listón (sección 10). Nada de resultados inventados. |

### 1.5 Arquitectura general

Tres niveles con puertos explícitos (diagrama completo en `docs/diagrams/arquitectura.mmd`):

```
┌────────────────────────────  CLIENTE  ────────────────────────────┐
│  UI: Next.js 16 (App Router) · React 19 · TS · Tailwind 4 ·        │
│      shadcn/ui (Radix) · Zustand (slices) · react-window            │
│  Lienzo: SVG nativo interactivo (viewBox zoom/pan, hit-test DOM)   │
│  Web Workers: vectorizador (WASM) · bg-removal (ONNX) · export ZIP │
│  Puertos: VectorizerEngine · BackgroundRemovalEngine · Exporter ·   │
│           SelectionStrategy · StorageGateway (cliente→API)         │
└───────────────┬───────────────────────────────────────────────────┘
                │ REST + JSON · JWT Bearer · RFC 7807 en errores
┌───────────────▼────────────  API (Route Handlers)  ────────────────┐
│  Validación Zod (strict) · Autenticación (jose JWT + argon2) ·      │
│  Rate limiting · Paginación cursor (createdAt,id) · Cuotas ·       │
│  Problemas RFC 7807 · Registries: Preset/Exporter/Operation        │
└───────┬─────────────────────────────────────────┬─────────────────┘
        │                                           │
┌───────▼────────────────┐            ┌─────────────▼────────────────┐
│  Prisma ORM            │            │  StorageAdapter (puerto)      │
│  SQLite (sandbox) →    │            │  Local FS (sandbox) →          │
│  PostgreSQL 16 (prod)  │            │  S3/MinIO/R2 (prod)           │
└────────────────────────┘            └──────────────────────────────┘
```

**Capas de dominio / aplicación / infraestructura (versión simplificada y declarada):** el tamaño del producto justifica hexagonal *light*: `src/lib/domain` (entidades + invariantes + errores de dominio), `src/lib/services` (casos de uso: crear proyecto, persistir vectorización, encolar exportación…), `src/lib/adapters` (implementaciones: Prisma, storage local/S3, motores). No se introduce un bus de eventos ni un contenedor DI: coste > beneficio (alternativa descartada: hexagonal completo con use-cases aislados y DI; se documenta en ADR-008).

### 1.6 Estructura de componentes (Átomos → Moléculas → Organismos → Página)

- **Átomos:** `Button`, `Badge`, `Tooltip`, `Slider`, `Switch`, `Skeleton`, `ColorSwatch` (muestra HEX accesible con nombre), `StateChip` (estado de validación).
- **Moléculas:** `PresetSelector` (generado desde el esquema del preset, ver 4.4), `ColorField` (HEX + paleta serigráfica de configuración), `LayerRow` (memoizada; clave `layer.id`), `QuotaMeter`, `DiagnosticsToast`, `CommandButton`.
- **Organismos:** `AssetPanel` (carga + validación), `LayerPanel` (árbol virtualizado), `VectorStage` (lienzo SVG interactivo), `InkPrepView` (preparación de tintas), `InspectorPanel` (propiedades, exportación), `ProjectsDrawer` (listado paginado por cursor), `DiagnosticsPanel` (taxonomía de fallos), `ExportDialog`.
- **Página:** una única ruta visible `/` (restricción del entorno); el espacio de trabajo conmuta vistas internas por estado (carga → editar → tintas → exportar). En producción con enrutado completo serían `/`, `/proyectos`, `/proyectos/[id]`; se documenta la equivalencia.

### 1.7 Gestión de estado (Zustand + slices) — justificación

- **Zustand** frente a Redux Toolkit: el estado es mediano y de alta frecuencia de actualización local (selección, zoom, colores). Zustand con selectores evita re-renders globales sin ceremonia de actions/reducers/dispatch. *Coste:* disciplina de selectores. *Alternativa descartada:* Redux (más boilerplate, indirección extra no justificada); TanStack Query se usa para el **estado de servidor** (proyectos, exports) y Zustand para el **estado de sesión de trabajo** (ADR-004).
- **Slices:**
  - `projectSlice`: proyecto activo, assets, vectorización, capas (espejo de servidor + cambios pendientes).
  - `toolSlice`: herramienta activa, zoom/pan, selección, capas aisladas.
  - `historySlice`: pila undo/redo de comandos (patrón Command), límite configurable (100).
  - `exportSlice`: estado de exportaciones en curso (worker), progreso, resultados.
  - `diagnosticsSlice`: registro clasificado de fallos (seis clases, ver 8).
  - `authSlice`: sesión, tokens, cuota restante.
- **Undo/redo:** comandos puros (`RecolorLayersCommand`, `RemoveBackgroundCommand`, `ToggleVisibilityCommand`, `RenameLayerCommand`, `ReorderLayerCommand`) con `apply/undo`, serializables y acotados por `limits.layers.historyStackSize`.

### 1.8 Decisiones técnicas (resumen; detalle en ADRs)

| # | Decisión | Problema que resuelve | Coste | Alternativa descartada | ADR |
|---|---|---|---|---|---|
| D-01 | Vectorización WASM **en cliente** | Coste/latencia de servidor + privacidad | Bundle ≈1–2 MiB; memoria del tab; complejidad de Workers | Vectorizar en servidor (coste por conversión, subida obligatoria de la imagen) | ADR-001 |
| D-02 | **SVG nativo interactivo** para el lienzo | Los datos ya son paths SVG: hit-test y recolor nativos, export = serializar | Rendimiento DOM con >>10⁴ nodos (mitigado por capas/visibilidad) | Konva/Fabric (convierte paths a escena canvas, doble estado, export requiere re-serializar) | ADR-002 |
| D-03 | **Workers** (1 por tipo de tarea, cancelables) | No congelar el hilo principal; O(píxeles) en background | Complejidad de mensajes/transferables | Todo en hilo principal (jank) o pool genérico (sobreingeniería) | ADR-003 |
| D-04 | **Zustand slices** | Estado local de alta frecuencia sin re-renders globales | Disciplina de selectores | Redux Toolkit | ADR-004 |
| D-05 | **Prisma + SQLite (sandbox) → PostgreSQL (prod)** | Persistencia relacional con migraciones | Sin enums nativos en SQLite → validación Zod en el borde | Mongoose/NoSQL (no hay razón: los datos son relacionales) | ADR-005 |
| D-06 | **StorageAdapter** local→S3 | Almacenamiento de objetos portable | Una indirección | Disco local acoplado (insalvable en prod) | ADR-006 |
| D-07 | **JWT acceso+refresco con jose + argon2** | Contrato del enunciado (access+refresh, argon2) | Rotación/revocación requiere tabla `RefreshToken` | NextAuth v4 (flujo de refresh con Credentials no es de primera clase) | ADR-007 |
| D-08 | **Registros con esquemas** (Preset/Exporter/Operation/Selection) | Extensión sin tocar núcleo (regla del carro) | Coste de indirección acotado y documentado | `switch` central (viola la regla del carro) | ADR-008 |
| D-09 | **Bg-removal ONNX en cliente** | Privacidad + coste cero de servidor | Descarga de modelo (10–40 MiB) gestionada con aviso | API externa de pago (rompe “sin subir la imagen”) | ADR-009 |
| D-10 | **Cursor compuesto (createdAt,id)** | Paginación estable con orden temporal | Codificación base64url + OR en query | OFFSET (salta filas con escrituras concurrentes) | ADR-010 |
| D-11 | **Next.js 16 unificado** (route handlers como API) | Restricción real del entorno (1 puerto) | Sin escalado independiente del API en esta iteración | Separar Fastify ahora (no aporta en sandbox; plan de extracción documentado) | ADR-000 |

### 1.9 Mapa de módulos (equivalencia con el monorepo propuesto)

El enunciado propone `packages/vectorizer`, `packages/bg-removal`, `packages/exporter`, `apps/web`, `apps/api`. En un único repo Next.js, los “paquetes” son módulos con límite de importación declarado:

| Paquete propuesto | Módulo real (Fase 6) | Exporta (puertos) |
|---|---|---|
| `packages/vectorizer` | `src/lib/vectorizer/` + `src/workers/vectorizer.worker.ts` | `VectorizerEngine`, `VectorParams`, `parseSvgResult` |
| `packages/bg-removal` | `src/lib/bg-removal/` + `src/workers/bg-removal.worker.ts` | `BackgroundRemovalEngine`, `AlphaMaskResult` |
| `packages/exporter` | `src/lib/exporter/` + `src/workers/export.worker.ts` | `Exporter`, `ExporterRegistry`, manifest types |
| `apps/web` | `src/app/` + `src/components/` | UI |
| `apps/api` | `src/app/api/**/route.ts` + `src/lib/http/` | contratos REST (Fase 3) |

### 1.10 Complejidad declarada de las operaciones pesadas

| Operación | Complejidad | Memoria típica | Estrategia | Límite práctico (config) |
|---|---|---|---|---|
| Vectorización | O(W·H) muestreo + O(paths) trazado | 2–4× tamaño raster | Worker propio, streaming de progreso, cancelable | `maxPixels` 4096² |
| Eliminación de fondo | O(W·H·modelo) (ONNX) | modelo (10–40 MiB) + buffers | Worker propio, carga de modelo perezosa con consentimiento visible | `maxPixels` + aviso de descarga |
| Separación en capas | O(paths) agrupación por color exacto | O(paths) | En cliente, sobre el parse del SVG | `maxLayers` 30 (merge forzoso por cercanía, configurable) |
| Exportación ZIP | O(bytes SVG por capa) | O(total bytes) | Worker propio (fflate) | `maxLayers` |
| Listados servidor | O(log n + limit) por índice compuesto | O(limit) | Cursor `createdAt,id`, `SELECT` explícito | `pagination.maxLimit` 100 |
| Render del árbol de capas | O(visible) con virtualización | O(umbral) | react-window > `virtualizationThreshold` (50) | — |

---

## 2. 🧬 Fase 2 — Modelado de Datos

### 2.1 Convenciones

- Toda entidad: `id` (UUID) + `createdAt`; mutables añaden `updatedAt`.
- Primitivos de esquema sin listas embebidas; los atributos dinámicos van en columnas `Json` validadas por Zod en el borde (Fase 4).
- SQLite no tiene enums nativos: los campos “enum” son `String` validados por Zod en la capa HTTP (ADR-005).
- Borrado en cascada desde `Project` (política `Cascade`): un proyecto y sus datos son una unidad de privacidad.

### 2.2 Entidades principales

| Entidad | Campos clave | Invariantes / validaciones |
|---|---|---|
| `User` | `id`, `email` (único), `name?`, `passwordHash` (argon2id), `plan` ('free'\|'pro'), `createdAt`, `updatedAt` | email RFC; password ≥ `auth.passwordMinLength` (10); nunca se devuelve `passwordHash` (SELECT explícito) |
| `RefreshToken` | `id`, `userId`, `tokenHash` (sha-256), `expiresAt`, `revokedAt?`, `createdAt` | rotación en cada uso; un token vale exactamente 1 vez; revocación en logout/robo |
| `Project` | `id`, `ownerId→User`, `name`, `description?` (nullable), `thumbnailKey?`, `createdAt`, `updatedAt` | `name` 1..`projects.nameMaxLength` (80); contaje por usuario ≤ `projects.maxPerUserFree` (cuota → 409 problema) |
| `Asset` | `id`, `projectId→Project`, `role` ('source'\|'result'\|'thumbnail'), `mimeType`, `width`, `height`, `bytes`, `storageKey`, `checksum` (sha-256), `createdAt` | MIME ∈ `limits.image.allowedMimeTypes`; `bytes>0 ≤ maxUploadBytes`; `1 ≤ width,height ≤ maxDimension`; `checksum` hex 64 |
| `Vectorization` | `id`, `assetId→Asset`, `engineId`, `presetId`, `params` (Json), `paramsSchemaVersion`, `svgStorageKey`, `nodeCount`, `createdAt` | `presetId` ∈ PresetRegistry; `params` valida contra el esquema del preset; `nodeCount>0` |
| `Layer` | `id`, `vectorizationId→Vectorization`, `orden`, `colorHex`, `name`, `svgFragmentKey`, `areaPx`, `visible`, `createdAt` | `colorHex` matchea `^#[0-9A-Fa-f]{6}$`; `orden` único por vectorización (0..maxLayers-1); `areaPx ≥ 0` |
| `Export` | `id`, `projectId→Project`, `formatId`, `storageKey`, `manifest` (Json), `manifestSchemaVersion`, `createdAt` | `formatId` ∈ ExporterRegistry; `manifest` valida contra el esquema del formato |
| `AuditEvent` | `id`, `userId?`, `projectId?`, `action` (string tipado), `metadata` (Json), `createdAt` | solo añadir; sin PII en `metadata` (guard de Fase 4); retención configurable |

### 2.3 Esquema Prisma (referencia de Fase 6; dialecto SQLite, equivalente en PostgreSQL)

```prisma
// prisma/schema.prisma — Fase 6 (preparada, no aplicada en esta iteración)
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite" url = env("DATABASE_URL") } // prod: provider = "postgresql"

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String?
  passwordHash String
  plan         String   @default("free") // Zod enum en el borde: 'free' | 'pro'
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  projects      Project[]
  refreshTokens RefreshToken[]
  auditEvents   AuditEvent[]
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, expiresAt])
}

model Project {
  id           String   @id @default(uuid())
  ownerId      String
  name         String
  description  String?
  thumbnailKey String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  owner        User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  assets       Asset[]
  exports      Export[]
  auditEvents  AuditEvent[]
  @@index([ownerId, createdAt, id]) // índice del cursor de listado
}

model Asset {
  id         String   @id @default(uuid())
  projectId  String
  role       String   // Zod: 'source' | 'result' | 'thumbnail'
  mimeType   String
  width      Int
  height     Int
  bytes      Int
  storageKey String   @unique
  checksum   String
  createdAt  DateTime @default(now())
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  vectorizations Vectorization[]
  @@index([projectId, createdAt, id])
}

model Vectorization {
  id                  String   @id @default(uuid())
  assetId             String
  engineId            String   // p. ej. 'vtracer-wasm' | 'imagetracer'
  presetId            String   // p. ej. 'baja' | 'media' | 'alta' | 'comic' (futuro)
  params              Json     // validado contra PresetRegistry.get(presetId).schema
  paramsSchemaVersion Int
  svgStorageKey       String
  nodeCount           Int
  createdAt           DateTime @default(now())
  asset               Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  layers              Layer[]
  @@index([assetId, createdAt, id])
}

model Layer {
  id              String       @id @default(uuid())
  vectorizationId String
  orden           Int
  colorHex        String
  name            String
  svgFragmentKey  String
  areaPx          Int
  visible         Boolean      @default(true)
  createdAt       DateTime     @default(now())
  vectorization   Vectorization @relation(fields: [vectorizationId], references: [id], onDelete: Cascade)
  @@unique([vectorizationId, orden]) // invariante: orden único por vectorización
  @@index([vectorizationId])
}

model Export {
  id                    String   @id @default(uuid())
  projectId             String
  formatId              String   // ExporterRegistry: 'zip-serigrafia' | 'png-mockup' | 'pdf-capas' (futuro)
  storageKey            String
  manifest              Json     // validado contra ExporterRegistry.get(formatId).manifestSchema
  manifestSchemaVersion Int
  createdAt             DateTime @default(now())
  project               Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, createdAt, id]) // índice del cursor de exportaciones
}

model AuditEvent {
  id        String   @id @default(uuid())
  userId    String?
  projectId String?
  action    String   // tipado por unión literal de Zod en el borde
  metadata  Json
  createdAt DateTime @default(now())
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  project    Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt, id])
  @@index([projectId, createdAt, id])
}
```

### 2.4 Atributos dinámicos (Json) y versionado

- `Vectorization.params`, `Export.manifest`, `AuditEvent.metadata` son columnas `Json` **encapsuladas**: solo se escriben tras `safeParse` contra el esquema del registro correspondiente (Fase 4) y se revalidan al leer con **migradores por versión** (`MigrationRegistry`: `v→v+1` encadenables). Nunca se confía en el JSON almacenado.
- Restricciones transversales (config): tamaño máximo de payload JSON (`limits.json.maxBytes`), profundidad máxima (`maxDepth`), claves peligrosas bloqueadas (`__proto__`, `constructor`, `prototype`) y guard anti-PII (patrones email/teléfono → rechazo con problema `invalid-params`).

### 2.5 Índices, restricciones y migraciones

- Índices compuestos `(owner|project|userId, createdAt, id)` exactamente donde pagina el cursor (ADR-010).
- Únicos: `User.email`, `Asset.storageKey`, `RefreshToken.tokenHash`, `@@unique([vectorizationId, orden])`.
- Estrategia: en sandbox `prisma db push` (schema-first sin datos que preservar); en producción `prisma migrate dev` en desarrollo y `prisma migrate deploy` en CI/CD, con revisión de drift. El esquema es idéntico en ambos dialectos salvo `provider` (ADR-005).

---

## 3. 📡 Fase 3 — Contratos API

### 3.1 Reglas transversales

- **Base:** `/api/**`. JSON salvo multipart.
- **Autenticación:** `Authorization: Bearer <accessToken>` (JWT, TTL 15 min). Refresco: `POST /api/auth/refresh` con cookie `httpOnly; SameSite=Lax` o body; rotación obligatoria (ADR-007).
- **Autorización:** todo recurso bajo `/api/projects/:id/**` verifica `project.ownerId === token.sub`. Recursos ajenos devuelven **404** (no 403) para no filtrar existencia; el 403 queda reservado a acciones con rol insuficiente sobre recursos propios (p. ej., exportar con cuota agotada devuelve 409, no 403). Taxonomía completa en 8 y `failure-modes.md`.
- **Paginación:** TODOS los listados aceptan `?limit=` y `?cursor=`. Cursor = `base64url(createdAtISO + "|" + id)`; orden `createdAt DESC, id DESC`. `limit` por defecto 20, máximo 100 (config). `nextCursor: null` = fin.
- **Validación:** Zod `.strict()` en body/query; desconocidos → 400 con detalle por campo. Multipart con tope de tamaño comprobado en `Content-Length` ANTES de leer el cuerpo (413 si excede).
- **Errores:** RFC 7807 en TODOS los errores 4xx/5xx:

```json
{
  "type": "https://vectortinta.example/problems/cuota-proyectos",
  "title": "Cuota de proyectos excedida",
  "status": 409,
  "detail": "El plan free permite 20 proyectos. Borra uno o pasa a pro.",
  "instance": "/api/projects",
  "errors": [{ "resource": "projects", "code": "quota_exceeded", "limit": 20 }]
}
```

- **Rate limiting:** ventana deslizante en memoria (prod: Redis — sustitución de adaptador). Por configuración: general 100 req/min/IP, auth 10 req/min/IP, mutaciones 30 req/min/usuario. 429 con cabecera `Retry-After` y problema RFC 7807.
- **SELECT explícito:** ninguna consulta usa `findMany` sin `select` de columnas concretas (regla de listón).

### 3.2 Catálogo de endpoints

| Método | Ruta | Auth | Rate limit | Paginación | Errores típicos |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | — | auth | — | 400 validación, 409 email existente |
| POST | `/api/auth/login` | — | auth | — | 401 credenciales |
| POST | `/api/auth/refresh` | cookie/body | auth | — | 401 token revocado/expirado |
| POST | `/api/projects` | Bearer | mutaciones | — | 400, 409 cuota |
| GET | `/api/projects?limit=&cursor=` | Bearer | general | ✅ cursor | 400 límites |
| GET | `/api/projects/:id` | Bearer | general | — | 401, 404 |
| PATCH | `/api/projects/:id` | Bearer | mutaciones | — | 400, 404 |
| DELETE | `/api/projects/:id` | Bearer | mutaciones | — | 404 |
| POST | `/api/projects/:id/assets` | Bearer | mutaciones | — | 413 tamaño, 400 MIME/dimensiones, 409 cuota de assets |
| GET | `/api/projects/:id/assets?limit=&cursor=` | Bearer | general | ✅ cursor | 404 |
| POST | `/api/projects/:id/vectorize` | Bearer | mutaciones | — | 400 preset/params inválidos, 409 capas > máximo |
| POST | `/api/projects/:id/layers` | Bearer | mutaciones | — | 400, 409 maxLayers |
| PATCH | `/api/projects/:id/layers/:layerId` | Bearer | mutaciones | — | 400 colorHex/orden inválido, 404 |
| GET | `/api/projects/:id/layers?limit=&cursor=` | Bearer | general | ✅ cursor | 404 |
| POST | `/api/projects/:id/exports` | Bearer | mutaciones | — | 400 formato, 409 cuota diaria |
| GET | `/api/projects/:id/exports?limit=&cursor=` | Bearer | general | ✅ cursor | 404 |
| GET | `/api/assets/:key` | Bearer | general | — | 404, 401 (streaming con autorización) |
| GET | `/api/health` | — | — | — | — |
| GET | `/api/metrics` | — (prod: interno) | — | — | — |

### 3.3 Contratos detallados (ejemplos canónicos)

#### POST /api/auth/register

```json
// Request
{ "email": "taller@serigrafia.es", "password": "tinta-solida-2024", "name": "Trellat" }
// 201
{ "user": { "id": "…", "email": "taller@serigrafia.es", "name": "Trellat", "plan": "free", "createdAt": "…" },
  "accessToken": "eyJ…", "tokenType": "Bearer", "expiresIn": 900,
  "refreshToken": "httpOnly-cookie; Path=/api/auth; SameSite=Lax" }
// 400 (RFC 7807) — password corta
{ "type": "…/problems/validacion", "title": "Cuerpo inválido", "status": 400,
  "errors": [{ "field": "password", "code": "too_small", "minLength": 10 }] }
```

#### GET /api/projects?limit=2&cursor=…

```json
// 200
{ "items": [
    { "id": "p-2", "name": "Camiseta festival", "description": null,
      "thumbnailUrl": "/api/assets/thumb-2", "layerCount": 7,
      "createdAt": "2025-06-01T10:00:00Z", "updatedAt": "2025-06-01T10:12:00Z" },
    { "id": "p-1", "name": "Tote bag dibujos", "description": "Arte del cliente",
      "thumbnailUrl": "/api/assets/thumb-1", "layerCount": 4,
      "createdAt": "2025-05-30T09:00:00Z", "updatedAt": "2025-05-30T09:30:00Z" }
  ],
  "nextCursor": "MjAyNS0wNS0zMFQwOTowMDowMFp8cC0x", "hasMore": true }
```

#### POST /api/projects/:id/vectorize (decisión: SÍNCRONA — justificación)

El cálculo pesado ocurre **en el cliente** (Worker WASM); este endpoint **persiste el resultado** (SVG ya generado) y crea `Vectorization` + `Layer[]` en una transacción. No se justifica cola de jobs en v1 (anti-sobreingeniería: no hay ejecución pesada en servidor). Si en el futuro se registra un motor de servidor, el endpoint se extiende con `?async=true` + job polling; el contrato ya reserva el campo `job` para ello (documentado, no inventado ahora).

```json
// Request
{ "presetId": "media",
  "params": { "colorPrecision": 4, "filterSpeckle": 4, "cornerThreshold": 60,
              "lengthThreshold": 4, "mode": "spline", "maxColors": 16 },
  "engineId": "vtracer-wasm",
  "sourceAssetId": "a-1",
  "svg": "<svg …>…</svg>",
  "layers": [
    { "orden": 0, "colorHex": "#F2EFE6", "name": "Blanco opaco", "areaPx": 182044 },
    { "orden": 1, "colorHex": "#1B1B1B", "name": "Negro intenso", "areaPx": 93122 }
  ] }
// 201
{ "vectorization": { "id": "v-9", "presetId": "media", "nodeCount": 412, "createdAt": "…" },
  "layers": [{ "id": "l-1", "orden": 0, "colorHex": "#F2EFE6", "name": "Blanco opaco",
               "svgFragmentUrl": "/api/assets/frag-1", "areaPx": 182044, "visible": true }] }
// 400 — params de otro preset:
{ "type": "…/problems/params-invalidos", "status": 400,
  "title": "Parámetros no válidos para el preset",
  "errors": [{ "field": "params.strokeWidth", "code": "unrecognized_key",
               "hint": "El campo pertenece al preset 'comic'" }],
  "supportedPresets": ["baja", "media", "alta"] }
```

#### POST /api/projects/:id/assets (multipart)

- Cabeceras: `Content-Type: multipart/form-data`; campos: `file` (binario), `role`, `width`, `height`, `checksum` (metadatos declarados por el cliente; S-06).
- Guardas: `Content-Length > limits.image.maxUploadBytes` → 413 sin leer el cuerpo; revalidación de bytes tras `formData()`; MIME ∈ allowlist; dimensiones ≤ máx.; proyecto propio (o 404); cuota de assets por proyecto (`projects.maxAssetsPerProject`, 12) → 409.

#### POST /api/projects/:id/exports

El ZIP se ensambla en el Worker del cliente (fflate); se sube por `StorageGateway` y se registra:

```json
// Request
{ "formatId": "zip-serigrafia",
  "storageKey": "exports/e-1.zip", "checksum": "…",
  "manifest": {
    "schemaVersion": 1, "projectId": "p-1",
    "printOrder": [
      { "layerId": "l-1", "order": 0, "fileName": "capa-00-#F2EFE6-l1.svg",
        "colorHex": "#F2EFE6", "colorName": "Blanco opaco", "inkMark": "TINTA-00-#F2EFE6",
        "areaPx": 182044, "coveragePercent": 45.51, "visible": true }
    ],
    "strategy": "by-area-desc",
    "source": { "presetId": "media", "engineId": "vtracer-wasm", "assetId": "a-1" }
  } }
// 201 → { "export": { "id": "e-1", "downloadUrl": "/api/assets/exports/e-1", "createdAt": "…" } }
```

#### GET /api/health y GET /api/metrics

`health` → `{ "status": "ok", "db": "up", "configDigest": "fnv1a:…", "version": "1.0.0" }`.
`metrics` → contadores en memoria (requests por código, vectorizaciones persistidas, exportaciones por formato) + uptime. En producción el recolector se sustituye por un adaptador Prometheus (documentado; no se afirma implementación).

#### GET /api/projects/:id (canónico del punto de persistencia del listón)

```json
// 200 — reconstruye todo el estado del espacio de trabajo tras una recarga
{ "project": { "id": "p-1", "name": "Camiseta festival", "description": null,
               "createdAt": "2025-06-01T10:00:00Z", "updatedAt": "2025-06-01T10:12:00Z" },
  "assets": [ { "id": "a-1", "role": "source", "mimeType": "image/png",
                "width": 2000, "height": 2000, "downloadUrl": "/api/assets/a-1" } ],
  "vectorization": { "id": "v-9", "presetId": "media", "engineId": "vtracer-wasm",
                     "params": { "colorPrecision": 4, "filterSpeckle": 4, "cornerThreshold": 60,
                                 "lengthThreshold": 4, "mode": "spline", "maxColors": 16 },
                     "nodeCount": 412, "svgUrl": "/api/assets/v-9" },
  "layers": [ { "id": "l-1", "orden": 0, "colorHex": "#F2EFE6", "name": "Blanco opaco",
                "visible": true, "areaPx": 182044, "svgFragmentUrl": "/api/assets/frag-1" } ] }
// 404 — proyecto inexistente O ajeno (mismo cuerpo a propósito; no se fila existencia)
{ "type": "…/problems/no-encontrado", "title": "Proyecto no disponible",
  "status": 404, "detail": "El proyecto no existe o no es tuyo.", "instance": "/api/projects/p-otro" }
```

#### Ejemplos del resto de clases de error (listón: "ejemplos concretos por caso")

```json
// 401 — token de acceso caducado/inválido
{ "type": "…/problems/token-invalido", "title": "No autenticado", "status": 401,
  "detail": "El token de acceso es inválido o ha caducado.", "instance": "/api/projects" }

// 413 — payload mayor que el límite configurado, detectado en Content-Length ANTES de leer el cuerpo
{ "type": "…/problems/payload-grande", "title": "Imagen demasiado grande", "status": 413,
  "detail": "El archivo supera 25 MiB.", "instance": "/api/projects/p-1/assets",
  "errors": [{ "code": "max_upload_bytes", "limitBytes": 26214400 }] }

// 429 — rate limit con Retry-After (cabecera HTTP)
{ "type": "…/problems/demasiadas-peticiones", "title": "Límite de peticiones", "status": 429,
  "detail": "Has superado 10 peticiones/minuto en autenticación.", "instance": "/api/auth/login",
  "errors": [{ "code": "rate_limited", "retryAfterSeconds": 42 }] }

// 503 — error temporal del almacenamiento (reintento con backoff)
{ "type": "…/problems/temporal", "title": "Almacenamiento no disponible", "status": 503,
  "detail": "No se pudo escribir el ZIP; reintenta en unos segundos.", "instance": "/api/projects/p-1/exports",
  "errors": [{ "code": "storage_temporal", "sugerencia": "reintentar-con-backoff" }] }
```

---

## 4. 🧠 Fase 4 — Lógica de Inserción Extensible

### 4.1 Principio

Toda configuración de negocio entra como **datos validados contra esquemas registrados**, nunca como código nuevo en el núcleo. Tres registros (ADR-008): `PresetRegistry` (presets de vectorización), `ExporterRegistry` (formatos de exportación + esquema de su manifest) y `OperationRegistry` (operaciones de imagen: bg-removal, esqueletonizado futuro…). Los tres comparten el contrato:

```ts
interface RegistryEntry<TId extends string, TSchema extends z.ZodType> {
  id: TId; label: string; description: string;
  schemaVersion: number; schema: TSchema; // zod .strict()
  metadata?: Record<string, string>;      // p. ej. "licencia": "pendiente-auditoria"
}
```

### 4.2 Flujo de validación de un JSON genérico (p. ej. `params`)

1. **Tamaño:** bytes > `limits.json.maxBytes` (8 KiB) → 400 `payload-too-large` (antes de parsear).
2. **Profundidad:** `maxDepth` (4) comprobada con un walker determinista → 400 `json-too-deep`.
3. **Claves peligrosas:** `__proto__`, `prototype`, `constructor` → 400 `unsafe-key` (defensa en profundidad; se **rechazan**, no se ignoran, para no ocultar errores).
4. **Guard anti-PII:** patrones de email/teléfono en valores de primer nivel → 400 con sugerencia (`hint: "los params no admiten datos personales"`).
5. **Resolución de esquema:** `PresetRegistry.get(presetId)`; preset inexistente → 400 con `supportedPresets` (recurso enumerable, no error opaco).
6. **safeParse estricto:** campos desconocidos → `unrecognized_key` por campo; tipos incorrectos → `invalid_type`; rangos con límites del preset (p. ej. `colorPrecision` 1..8).
7. **Versionado:** se almacena `{ values, schemaVersion }`; al leer, si `schemaVersion < actual` se aplican migradores registrados encadenados (`MigrationRegistry`), luego revalidación. Un JSON corrupto tras migrar → error `CONFIG` clasificado, se aísla el proyecto y se avisa (nunca se “arregla” silenciosamente).

### 4.3 Tratamiento diferenciado (regla 4 del listón)

| Situación | Tratamiento | Ejemplo concreto |
|---|---|---|
| Campo opcional ausente | Se aplica el default **del esquema del preset** | `params.filterSpeckle` ausente en `baja` → default 8 |
| Valor `null` explícito en campo nullable | Se conserva como `null` y la UI lo muestra como “sin valor” con chip informativo; **no** se convierte en default | `project.description: null` → se pinta “—” |
| `null` en campo NO nullable | 400 `invalid_type` (no se oculta) | `layers[0].colorHex: null` → rechazado |
| Dato inválido | 400 con detalle por campo + acción sugerida | `colorHex: "#12"` → `errors:[{field:"colorHex",code:"invalid_pattern"}]` |
| Desconocido del sistema (preset/formato/engine) | 400 enumerable con lista soportada | `presetId:"comic"` sin registrar → `supportedPresets` |
| Error temporal | Reintento con backoff en cliente; 503 con `Retry-After` | fallo de red al subir ZIP → toast “Reintentar” |
| Error de configuración | Clase `CONFIG` con instrucción visible | falta `NEXT_PUBLIC_BG_REMOVAL_MODEL_URL` → banner con el nombre exacto de la variable |
| Fallo crítico | Modo diagnóstico + export del estado + recuperación a último punto persistido | OOM del Worker → modal, botón “Recuperar espacio de trabajo” |

### 4.4 Extensión real: preset “cómic” (solo configuración)

Hoy: `baja`, `media`, `alta` (semillas en `app.config.ts`, esquemas en `src/lib/registries/presets/`). Añadir “cómic”:

1. Crear `src/lib/registries/presets/comic.ts` con `schemaVersion: 1` y `schema` que AÑADE `strokeWidth: z.number().min(0).max(20)` a los campos comunes.
2. Añadir `"comic"` al array `vectorization.presetManifest` en `app.config.ts`.
3. Nada más. `PresetRegistry` construye el mapa desde el manifiesto; el **formulario del inspector se genera desde el esquema** (metadatos de campo: label, min, max, step, unidad), por lo que la UI del preset nuevo sale gratis; el validador central (`http/validate.ts`) valida “contra el esquema del preset dado”, no contra una lista fija.

**Coste del patrón:** indirección Registro (un `Map` de entradas) y disciplina de `schemaVersion`. **Alternativa descartada:** `switch(presetId)` en el validador (cada preset nuevo tocaría el núcleo: viola la regla del carro). Igual para `ExporterRegistry` (añadir `pdf-capas` = registrar entrada con `manifestSchema` propio) e `OperationRegistry`.

---

## 5. 🖥️ Fase 5 — Estrategia de Renderizado y Listas

### 5.1 Layout de trabajo (una sola ruta visible `/`)

```
┌──────────┬─────────────────────────────┬──────────────┐
│ IZQUIERDA│        CENTRO               │  DERECHA     │
│ Asset +  │  VectorStage (SVG nativo)   │  Inspector   │
│ Layers   │  zoom/pan · selección       │  preset      │
│ (virtual.│  recolor instantáneo        │  colores     │
│  >50)    │  vistas: editar | tintas    │  exportación │
└──────────┴─────────────────────────────┴──────────────┘
```

### 5.2 Iteración dinámica sobre capas y colores

- Fuente de verdad: `projectSlice.layers` (espejo del servidor + ediciones locales); cada nodo React usa `key = layer.id` (nunca el índice).
- El SVG se renderiza como `<g data-layer-id>` por capa con `path.fill = layer.colorHex`; la visibilidad (`layer.visible === false`) se traduce en `display="none"` (no desmontaje: preserva el DOM para undo inmediato).
- **Degradación segura de campos:** `colorHex` inválido en datos leídos (p. ej. historial antiguo) → se aplica el color de rescate de configuración `rendering.fallbackColorHex` (#FF00FF “magenta de rescate”, imposible de confundir) + chip de diagnóstico en la capa afectada. Nunca se pinta silenciosamente otro color del mismo rango: el magenta denuncia el problema.

### 5.3 Interacción en el lienzo (presupuesto <100 ms con imagen 2000×2000)

| Operación | Mecanismo | Complejidad | Presupuesto |
|---|---|---|---|
| Selección de zona | `pointerdown` + `closest('[data-layer-id]')` (hit-test nativo del DOM) | O(profundidad del nodo) | < 10 ms |
| Recoloreo | cambio de `fill` en los paths del grupo + comando al historial; sin re-render React del árbol (refs directas) | O(paths de la capa) | < 16 ms (1 frame) |
| Zoom/pan | mutación de `viewBox` en `toolSlice` (no re-renderiza capas) | O(1) | < 16 ms |
| Arrastre de orden | dnd-kit sobre lista virtualizada → `ReorderLayerCommand` | O(visible) | < 50 ms |
| Aislar capa (solo) | toggle `display` del resto | O(n capas) | < 30 ms |

Mecanismos: `React.memo` en `LayerRow`; selectores finos de Zustand (`useProjectStore(s => s.layersById.get(id))`); `useMemo` del árbol visible; refs al DOM SVG para mutaciones hot-path (el color no pasa por React hasta persistir). **Estado de esta tabla:** presupuesto declarado a nivel de diseño (verificación estática); protocolo de medición real con fixtures en `docs/fixtures/README.md` (PerformanceObserver + user timing). No se afirma ejecución no realizada.

### 5.4 Listas infinitas

- **Servidor:** cursor `?limit=&cursor=` en TODOS los listados (3.1).
- **Cliente:** `LayerPanel` con `react-window` cuando `layers.length > rendering.virtualizationThreshold` (50, config); `ProjectsDrawer` siempre virtualizado (n puede ser 500). Claves estables (`id`), sin índices.
- **SELECT explícito** en Prisma con columnas concretas por endpoint (nunca `SELECT *`).

### 5.5 Estados por panel (obligatorio, sin excepciones)

Cada panel implementa los cinco estados: **carga** (skeleton del mismo layout), **vacío** (CTA con acción primaria: “Carga tu primera imagen”), **error** (mensaje accionable + botón Reintentar con backoff), **parcial** (datos degradados con chip de diagnóstico no bloqueante), **listo**. Los toasts son resultado de acciones; los estados de panel son del propio panel (no se usa toast para enmascarar un panel vacío).

### 5.6 Undo/redo y persistencia

- Comandos en `historySlice` (aplicar/deshacer serializables, límite configurable). Persistencia: tras cada acción confirmada (recolor, reorder, rename) se hace `PATCH` del recurso afectado con reintentos; tras recarga, `GET /api/projects/:id` reconstruye el estado completo (origen + vectorización + capas + colores). El campo `visible` y el orden se persisten para que la vista “tintas” sobreviva a la recarga (requisito del listón: persistencia recuperable).

---

## 6. 💻 Fase 6 — Código Fuente (PREPARADA, no implementada en esta iteración)

> **Estado declarado:** por acuerdo del enunciado (“solo se planifica; la Fase 6 debe quedar preparada pero no inventada”), **no existe implementación del producto en esta entrega**. Se entrega: árbol objetivo completo, firmas clave con intención, comandos exactos y **un artefacto real de configuración** (`src/lib/config/app.config.ts`, validado con Zod) que ya es ejecutable y sirve de prueba viva de la regla de cero-hardcoding (el visor de la spec lo importa y renderiza sus valores).

### 6.1 Árbol objetivo

```
src/
├─ app/
│  ├─ page.tsx                      // única ruta visible: espacio de trabajo
│  └─ api/
│     ├─ auth/register|login|refresh/route.ts
│     ├─ projects/route.ts · [id]/route.ts
│     ├─ projects/[id]/assets/route.ts
│     ├─ projects/[id]/vectorize/route.ts
│     ├─ projects/[id]/layers/route.ts · [layerId]/route.ts
│     ├─ projects/[id]/exports/route.ts
│     ├─ assets/[key]/route.ts      // streaming autorizado
│     └─ health/route.ts · metrics/route.ts
├─ components/
│  ├─ atoms/ (ColorSwatch, StateChip, …)
│  ├─ molecules/ (PresetSelector, ColorField, LayerRow, QuotaMeter, …)
│  └─ organisms/ (AssetPanel, LayerPanel, VectorStage, InkPrepView,
│                 InspectorPanel, ProjectsDrawer, DiagnosticsPanel, ExportDialog)
├─ lib/
│  ├─ config/{app.config.ts ✓ real, server.config.ts}   // cliente / servidor
│  ├─ domain/{entities.ts, invariants.ts, errors.ts}   // tipos + invariantes puras
│  ├─ registries/{registry.ts, preset-registry.ts, exporter-registry.ts,
│  │              operation-registry.ts, migrations.ts, presets/{baja,media,alta}.ts}
│  ├─ vectorizer/{types.ts, engines/{vtracer-wasm.ts, imagetracer.ts}, pipeline.ts}
│  ├─ bg-removal/{types.ts, engines/{imgly.ts, u2net-onnx.ts}, pipeline.ts}
│  ├─ exporter/{zip.ts, formats/{zip-serigrafia.ts, png-mockup.ts}}
│  ├─ storage/{adapter.ts, local.ts, s3.ts}
│  ├─ auth/{jwt.ts, argon2.ts, guards.ts}
│  ├─ http/{problem.ts, validate.ts, cursor.ts, rate-limit.ts}
│  └─ state/{store.ts, slices/{project,tool,history,export,diagnostics,auth}.ts}
├─ workers/{vectorizer.worker.ts, bg-removal.worker.ts, export.worker.ts}
prisma/schema.prisma   // como en 2.3
docs/                  // este plan, ADRs, diagramas, fixtures
```

### 6.2 Firmas clave (contratos de implementación; sin cuerpos)

```ts
// lib/vectorizer/types.ts
export interface VectorizerEngine {
  id: string; metadata: { license: 'audited-ok' | 'pending-audit' };
  run(input: { imageData: ImageBitmap; params: VectorParams }, signal: AbortSignal):
    Promise<VectorResult>; // VectorResult = { svg: string; nodeCount: number }
}
// Workers — mensajes tipados:
//   { kind: 'request', jobId, … } | { kind: 'progress', jobId, phase, percent }
//   { kind: 'success' | 'error' | 'cancelled', jobId, … }

// lib/bg-removal/types.ts
export interface BackgroundRemovalEngine {
  id: string; modelUrlFrom(config: AppConfig): string;
  remove(input: { imageData: ImageBitmap }, signal: AbortSignal):
    Promise<{ alphaMask: ImageData }>; // reversible: la máscara es un comando del historial
}

// lib/exporter/types.ts
export interface Exporter {
  id: string; manifestSchema: z.ZodType<ExportManifest>;
  build(project: ProjectSnapshot, layers: LayerView[]):
    Promise<{ blob: Blob; manifest: ExportManifest }>;
}

// lib/storage/adapter.ts
export interface StorageAdapter {
  put(key: string, data: Blob, meta: { checksum: string }): Promise<{ key: string }>;
  get(key: string): Promise<ReadableStream>;
  delete(key: string): Promise<void>;
  sign(key: string, ttlSeconds: number): Promise<string>;
}

// lib/http/cursor.ts
export function encodeCursor(c: { createdAt: Date; id: string }): string; // base64url
export function decodeCursor(raw: string): { createdAt: Date; id: string }; // valida
```

### 6.3 Comandos exactos (reproducibles)

```bash
# Entorno de esta iteración (sandbox, Bun + Next.js 16):
bun install                 # dependencias
bun run dev                 # desarrollo en :3000
bun run db:push             # aplicar esquema Prisma (sandbox, schema-first)
bun run lint                # ESLint
bunx tsc --noEmit           # verificación de tipos

# Camino de producción (documentado, NO ejecutado en esta iteración):
# docker compose up -d        # PostgreSQL 16 + MinIO (compose a crear en producción; no incluido en esta iteración)
# prisma migrate deploy       # migraciones versionadas (provider = "postgresql")
# pnpm build && pnpm start    # build autónomo
```

### 6.4 Definition of Done de la implementación (cuando se pida)

Cada punto del listón tendrá su verificación asociada (unit test, e2e Playwright, fixture perceptual); el Árbitro solo cerrará con evidencia ejecutada o con “no verificado” explícito. Esta iteración marca el protocolo, no lo ejecuta.

---

## 7. Ejemplo completo de extensibilidad (recorrido obligatorio del enunciado)

**Añadir preset `comic`** y **formato `pdf-capas`**:

```
UI (inspector) lee PresetRegistry → formulario autogenerado del esquema del preset
→ Worker vectorizador recibe { presetId: 'comic', params } (validado en cliente)
→ POST /api/projects/:id/vectorize → http/validate.ts → PresetRegistry.get('comic').schema.safeParse
→ persist Vectorization { presetId:'comic', params, paramsSchemaVersion:1 }
→ GET proyecto → LayerPanel/VectorStage renderizan capas (espejo de datos, sin cambios de núcleo)
→ Export: ExporterRegistry.get('pdf-capas') → export.worker ensambla → POST /api/…/exports
```

**Código nuevo escrito:** 1 archivo de esquema de preset + 1 entrada en el manifiesto de `app.config.ts`; 1 archivo de exportador PDF + 1 entrada en el manifiesto de formatos. **Cero cambios** en `VectorizerService`, pipeline, editor o validador central. (Extensión de *datos/variantes*: solo configuración. Extensión de *comportamiento* —p. ej. nueva herramienta de selección por cuenca—: nueva estrategia registrada en `SelectionStrategyRegistry`, con código + pruebas, sin tocar el lienzo.)

---

## 8. Tolerancia a fallos (resumen; detalle con ejemplos en `docs/decisions/failure-modes.md`)

| Clase | Ejemplo concreto del producto | Detección | Tratamiento en UI |
|---|---|---|---|
| Campo opcional ausente | `project.description` no enviado | Zod | “—” en inspector; sin error |
| Valor nulo | `layer.name === null` en datos leídos | guard de lectura | nombre derivado “Capa 03” + chip informativo; nunca crash |
| Dato inválido | `colorHex: "#12"` en PATCH | Zod + invariante | 400 con campo exacto; formulario marca el campo |
| Error temporal | timeout subiendo el ZIP de exportación | fetch/worker error | toast con “Reintentar” + backoff (3 intentos, luego diagnóstico) |
| Error de autorización | token expirado a mitad de sesión | 401/404 de la API | relogin transparente con refresh; si falla, redirect a login conservando borrador local |
| Error de configuración | `NEXT_PUBLIC_BG_REMOVAL_MODEL_URL` sin definir | chequeo de arranque del engine | banner bloqueante con el nombre exacto de la variable y link a docs |
| Fallo crítico | OOM en el Worker de vectorización | `onerror` del worker | modal de diagnóstico + “Recuperar espacio de trabajo” (último estado persistido) + export del informe |

Principio: los errores **importantes nunca se convierten** silenciosamente en defaults; los defaults solo cubren opcionales ausentes definidos por esquema. Todo fallo queda registrado en `diagnosticsSlice` con clase, causa y acción sugerida.

---

## 9. Cero hardcoding — dónde vive cada valor de negocio

| Valor | Ubicación | Esquema |
|---|---|---|
| Límites de imagen (px, bytes, MIME) | `app.config.ts → limits.image` | `LimitsImageSchema` |
| Máx. capas / historial / umbral virtualización | `limits.layers`, `rendering.virtualizationThreshold` | Zod |
| Cuotas (proyectos, exports/día, assets/proyecto) | `limits.projects`, `limits.exports` | Zod |
| Presets (ids, defaults, rangos) | `vectorization.presetManifest` + `src/lib/registries/presets/*.ts` | Zod por preset |
| Paleta serigráfica con nombre | `colors.inkPalette` | Zod (hex + nombre) |
| Patrones de nombre de archivo y marca de tinta | `export.filePattern` = `capa-{orden:02d}-{colorHex}-{layerId}.svg`, `export.inkMarkPattern` = `TINTA-{orden:02d}-{colorHex}` (token `{orden:02d}` = relleno a 2 dígitos) | Zod (plantilla) |
| Estrategia de orden de impresión | `export.printOrderStrategy` | Zod enum |
| TTL de tokens, rate limits, `auth.passwordMinLength` y parámetros argon2 (m=19456, t=2, p=1) | `server.config.ts` (env-driven) | Zod + env |
| Color de rescate de render | `rendering.fallbackColorHex` | Zod |

Constantes técnicas justificadas (únicas permitidas): tamaños de cabecera HTTP, seed de hash de checksum, factor de zoom por rueda (declaradas con comentario de justificación).

**Verificación viva:** el artefacto `src/lib/config/app.config.ts` está implementado, tipado y validado con Zod, y el visor de esta especificación **importa y renderiza** sus valores reales (no copias). Cambiar un límite = editar configuración, no código.

---

## 10. Informe del Árbitro

Acta completa con las **4 pasadas reales** del loop en `docs/INFORME-ARBITRO.md` y en la sección homónima del visor:

- **Ronda 0 (autoauditoría del orquestador):** digest no portable corregido antes de publicar (FNV-1a puro); grep TODO/FIXME sin marcadores reales.
- **Ronda 1 (árbitro adversarial independiente, Task ARB-1):** veredicto *PASA CON CORRECCIONES MENORES*. Reprodujo todas las verificaciones afirmadas (digest, fixtures, tsc/lint 0, HTTP 200, 375 px sin scroll) y devolvió 10 rechazos accionables (R-1..R-10): cursor de ejemplo mal codificado, fixtures JPEG con extensión .png, cuerpos RFC 7807 ausentes (401/404/413/429/503), worklog sin ejecución real, referencias muertas, padding de {orden} sin declarar, conteo de listados, "localStorage cifrado" sin mecanismo, mapa §9 incompleto y ejemplo GET :id ausente.
- **Ronda 2 (pre-cierre del orquestador):** R-1..R-10 aplicados y re-verificados uno a uno con comandos reproducibles.
- **Ronda 3 (verificación independiente del árbitro, Task ARB-2):** re-verificó los diez rechazos con comandos propios y auditó el acta: 9 OK + R-6 parcial → hallazgo residual **R-6b** (ejemplo de manifest con `capa-01` en vez de `capa-00` con `order: 0` y token `:02d`), **N-2** (frases "0 coincidencias" reformuladas a "material de contrato vigente") y **N-3** (procedimiento: el veredicto de una auditoría independiente no se pre-escribe; el acta describe ahora la secuencia real). Todo corregido en esta entrega.

**Veredicto final (ARB-2): ACEPTADA como planificación.** Los puntos de runtime del listón quedan explícitamente NO VERIFICADOS hasta la Fase 6 (por acuerdo del enunciado), con sus protocolos de reproducción documentados en `docs/fixtures/README.md`.

---

## 11. Anexos

- `docs/decisions/` — ADR-000…ADR-010 + `failure-modes.md` (cada ADR con *problema / coste / alternativa descartada*).
- `docs/diagrams/` — `arquitectura.mmd`, `flujo-vectorizacion.mmd`, `er.mmd` (fuentes Mermaid + guía de render).
- `docs/fixtures/` — imágenes de referencia + protocolo de verificación perceptual (SSIM ≥ 0,92) y de rendimiento (<100 ms).
- `src/lib/config/app.config.ts` — artefacto real de configuración (Zod).
- Visor navegable de esta especificación en la ruta `/` (única visible del entorno).
