'use client';

/**
 * Visor interactivo de la especificación VectorTinta (Iteración 1: SOLO PLANIFICACIÓN).
 * Documento canónico en docs/PLAN-MAESTRO.md; ADRs en docs/decisions/.
 * Este visor NO es el producto: presenta la especificación. El único artefacto
 * ejecutable de Fase 6 es src/lib/config/app.config.ts (ver panel “en vivo”).
 */

import * as React from "react";
import {
  AlertTriangle,
  Brain,
  Code2,
  Compass,
  Database,
  FolderTree,
  Gauge,
  Monitor,
  SatelliteDish,
  Scale,
  ScrollText,
  CircleCheck,
  Clock3,
  FileSearch,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { appConfig, configDigest } from "@/lib/config/app.config";
import {
  adrs,
  decisions,
  docsIndex,
  endpoints,
  failureModes,
  liston,
  perfBudget,
  phases,
  risks,
  validationSteps,
  type ListonStatus,
} from "@/content/spec-data";
import { arbiterResumen, arbiterRounds } from "@/content/arbiter";
import { Chip, CodeBlock, DataTable, InfoCard, InkList, SectionShell, SubHead } from "./primitives";
import { ArchitectureDiagram, EntityCards, FlowSteps, WorkspaceDiagram } from "./diagrams";
import { LiveConfig } from "./LiveConfig";

const NAV_ICONS: Record<string, React.ReactNode> = {
  "scroll-text": <ScrollText className="size-3.5" aria-hidden />,
  compass: <Compass className="size-3.5" aria-hidden />,
  database: <Database className="size-3.5" aria-hidden />,
  "satellite-dish": <SatelliteDish className="size-3.5" aria-hidden />,
  brain: <Brain className="size-3.5" aria-hidden />,
  monitor: <Monitor className="size-3.5" aria-hidden />,
  code: <Code2 className="size-3.5" aria-hidden />,
  gauge: <Gauge className="size-3.5" aria-hidden />,
  scale: <Scale className="size-3.5" aria-hidden />,
  "folder-tree": <FolderTree className="size-3.5" aria-hidden />,
};

/* ─────────────────────────── Códigos ─────────────────────────── */

const PRISMA_SCHEMA = `// prisma/schema.prisma — Fase 6 (PREPARADA: no aplicada en esta iteración)
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
  projects       Project[]
  refreshTokens  RefreshToken[]
  auditEvents    AuditEvent[]
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
  checksum   String   // sha-256
  createdAt  DateTime @default(now())
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  vectorizations Vectorization[]
  @@index([projectId, createdAt, id])
}

model Vectorization {
  id                  String   @id @default(uuid())
  assetId             String
  engineId            String   // 'vtracer-wasm' | 'imagetracer'
  presetId            String   // 'baja' | 'media' | 'alta' | 'comic' (futuro)
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
  colorHex        String       // ^#[0-9A-Fa-f]{6}$
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
  formatId              String   // ExporterRegistry
  storageKey            String
  manifest              Json     // validado contra el esquema del formato
  manifestSchemaVersion Int
  createdAt             DateTime @default(now())
  project               Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, createdAt, id]) // índice del cursor de exportaciones
}

model AuditEvent {
  id        String   @id @default(uuid())
  userId    String?
  projectId String?
  action    String   // unión literal de Zod en el borde
  metadata  Json     // sin PII (guard de Fase 4)
  createdAt DateTime @default(now())
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  project    Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt, id])
  @@index([projectId, createdAt, id])
}`;

const PROBLEM_EXAMPLE = `{
  "type": "https://vectortinta.example/problems/cuota-proyectos",
  "title": "Cuota de proyectos excedida",
  "status": 409,
  "detail": "El plan free permite 20 proyectos. Borra uno o pasa a pro.",
  "instance": "/api/projects",
  "errors": [{ "resource": "projects", "code": "quota_exceeded", "limit": 20 }]
}`;

const ERRORS_EXAMPLE = `// 401 — token de acceso caducado/inválido
{ "type": "…/problems/token-invalido", "title": "No autenticado", "status": 401,
  "detail": "El token de acceso es inválido o ha caducado.", "instance": "/api/projects" }

// 404 — proyecto inexistente O ajeno (mismo cuerpo a propósito; no se filtra existencia)
{ "type": "…/problems/no-encontrado", "title": "Proyecto no disponible", "status": 404,
  "detail": "El proyecto no existe o no es tuyo.", "instance": "/api/projects/p-otro" }

// 413 — detectado en Content-Length ANTES de leer el cuerpo
{ "type": "…/problems/payload-grande", "title": "Imagen demasiado grande", "status": 413,
  "detail": "El archivo supera ${Math.round(appConfig.limits.image.maxUploadBytes / 1048576)} MiB.", "errors": [{ "code": "max_upload_bytes", "limitBytes": ${appConfig.limits.image.maxUploadBytes} }] }

// 429 — con cabecera HTTP Retry-After
{ "type": "…/problems/demasiadas-peticiones", "title": "Límite de peticiones", "status": 429,
  "detail": "Has superado 10 peticiones/minuto en autenticación.",
  "errors": [{ "code": "rate_limited", "retryAfterSeconds": 42 }] }

// 503 — error temporal del almacenamiento (reintento con backoff)
{ "type": "…/problems/temporal", "title": "Almacenamiento no disponible", "status": 503,
  "detail": "No se pudo escribir el ZIP; reintenta en unos segundos.",
  "errors": [{ "code": "storage_temporal", "sugerencia": "reintentar-con-backoff" }] }`;

const GET_PROJECT_EXAMPLE = `GET /api/projects/p-1 — canónico del punto de persistencia del listón (recarga)
// 200 — reconstruye todo el estado del espacio de trabajo
{ "project": { "id": "p-1", "name": "Camiseta festival", "description": null },
  "assets": [ { "id": "a-1", "role": "source", "mimeType": "image/png",
                "width": 2000, "height": 2000, "downloadUrl": "/api/assets/a-1" } ],
  "vectorization": { "id": "v-9", "presetId": "media", "engineId": "vtracer-wasm",
                     "params": { "colorPrecision": 4, "filterSpeckle": 4, "cornerThreshold": 60,
                                 "lengthThreshold": 4, "mode": "spline", "maxColors": 16 },
                     "nodeCount": 412, "svgUrl": "/api/assets/v-9" },
  "layers": [ { "id": "l-1", "orden": 0, "colorHex": "#F2EFE6", "name": "Blanco opaco",
                "visible": true, "areaPx": 182044, "svgFragmentUrl": "/api/assets/frag-1" } ] }`;

const VECTORIZE_EXAMPLE = `POST /api/projects/p-1/vectorize        (SÍNCRONA: el cálculo pesado ya ocurrió en el cliente)
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
// 201 → { "vectorization": { "id": "v-9", "nodeCount": 412 }, "layers": [ … ] }
// 400 — params de otro preset:
{ "type": "…/problems/params-invalidos", "status": 400,
  "errors": [{ "field": "params.strokeWidth", "code": "unrecognized_key",
               "hint": "El campo pertenece al preset 'comic'" }],
  "supportedPresets": ["baja", "media", "alta"] }`;

const MANIFEST_EXAMPLE = `POST /api/projects/p-1/exports  —  el ZIP se ensambla en export.worker (cliente) y se registra:
{ "formatId": "zip-serigrafia", "storageKey": "exports/e-1.zip", "checksum": "…",
  "manifest": {
    "schemaVersion": 1, "projectId": "p-1", "strategy": "by-area-desc",
    "printOrder": [
      { "layerId": "l-1", "order": 0, "fileName": "capa-00-#F2EFE6-l1.svg",
        "colorHex": "#F2EFE6", "colorName": "Blanco opaco", "inkMark": "TINTA-00-#F2EFE6",
        "areaPx": 182044, "coveragePercent": 45.51, "visible": true }
    ],
    "source": { "presetId": "media", "engineId": "vtracer-wasm", "assetId": "a-1" }
  } }`;

const SIGNATURES = `// lib/vectorizer/types.ts — Fase 6 preparada (firmas; sin cuerpos por acuerdo)
export interface VectorizerEngine {
  id: string;
  metadata: { license: 'audited-ok' | 'pending-audit' };
  run(input: { imageData: ImageBitmap; params: VectorParams }, signal: AbortSignal):
    Promise<VectorResult>; // { svg: string; nodeCount: number }
}

// lib/bg-removal/types.ts
export interface BackgroundRemovalEngine {
  id: string;
  modelUrlFrom(config: AppConfig): string;
  remove(input: { imageData: ImageBitmap }, signal: AbortSignal):
    Promise<{ alphaMask: ImageData }>; // reversible: la máscara es un comando del historial
}

// lib/exporter/types.ts
export interface Exporter {
  id: string;
  manifestSchema: z.ZodType<ExportManifest>;
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

// lib/http/cursor.ts — paginación compuesta (ADR-010)
export function encodeCursor(c: { createdAt: Date; id: string }): string;  // base64url
export function decodeCursor(raw: string): { createdAt: Date; id: string }; // valida

// Workers — mensajes tipados:
// { kind: 'request', jobId, … } | { kind: 'progress', jobId, phase, percent }
// { kind: 'success' | 'error' | 'cancelled', jobId, … }`;

const FOLDER_TREE = `src/
├─ app/
│  ├─ page.tsx                      // única ruta visible: espacio de trabajo
│  └─ api/  auth/{register,login,refresh}/route.ts
│           projects/route.ts · [id]/route.ts
│           projects/[id]/{assets,vectorize,layers,exports}/route.ts
│           assets/[key]/route.ts   // streaming autorizado
│           health/route.ts · metrics/route.ts
├─ components/
│  ├─ atoms/ (ColorSwatch, StateChip, …)
│  ├─ molecules/ (PresetSelector, ColorField, LayerRow, QuotaMeter, …)
│  └─ organisms/ (AssetPanel, LayerPanel, VectorStage, InkPrepView,
│                 InspectorPanel, ProjectsDrawer, DiagnosticsPanel, ExportDialog)
├─ lib/
│  ├─ config/{app.config.ts ✓ REAL, server.config.ts}
│  ├─ domain/{entities.ts, invariants.ts, errors.ts}
│  ├─ registries/{registry, preset-registry, exporter-registry,
│  │              operation-registry, migrations}.ts
│  │              presets/{baja,media,alta}.ts
│  ├─ vectorizer/{types.ts, engines/{vtracer-wasm,imagetracer}.ts, pipeline.ts}
│  ├─ bg-removal/{types.ts, engines/{imgly,u2net-onnx}.ts, pipeline.ts}
│  ├─ exporter/{zip.ts, formats/{zip-serigrafia,png-mockup}.ts}
│  ├─ storage/{adapter.ts, local.ts, s3.ts}
│  ├─ auth/{jwt.ts, argon2.ts, guards.ts}
│  ├─ http/{problem.ts, validate.ts, cursor.ts, rate-limit.ts}
│  └─ state/{store.ts, slices/{project,tool,history,export,diagnostics,auth}.ts}
├─ workers/{vectorizer,bg-removal,export}.worker.ts
prisma/schema.prisma    // como en §2 (dialecto-agnóstico)
docs/                   // plan maestro, ADRs, diagramas, fixtures`;

const COMMANDS = `# Entorno de esta iteración (sandbox, Bun + Next.js 16) — REPRODUCIBLE:
bun install                 # dependencias
bun run dev                 # desarrollo en :3000
bun run db:push             # aplicar esquema Prisma (sandbox, schema-first)
bun run lint                # ESLint
bunx tsc --noEmit           # verificación de tipos

# Camino de producción (documentado, NO ejecutado en esta iteración):
# docker compose up -d        # PostgreSQL 16 + MinIO (docker-compose.yml)
# prisma migrate deploy       # migraciones versionadas (provider = "postgresql")
# pnpm build && pnpm start    # build autónomo`;

/* ─────────────────────────── Visor ─────────────────────────── */

export function SpecApp() {
  const [active, setActive] = React.useState<string>(phases[0].id);
  const activeRef = React.useRef<string>(phases[0].id);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) {
          activeRef.current = visible.target.id;
          setActive(visible.target.id);
        }
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: 0 },
    );
    phases.forEach((p) => {
      const el = document.getElementById(p.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const goTo = React.useCallback((id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#faf7f2] text-stone-900">
      {/* Cabecera */}
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#faf7f2]/95 backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-stone-900 font-serif text-lg font-bold text-[#f5efe4]">
                V
              </span>
              <div className="min-w-0">
                <p className="truncate font-serif text-base leading-tight font-semibold tracking-tight">
                  {appConfig.product.name} — Especificación
                </p>
                <p className="truncate text-[11px] text-stone-500">
                  Iteración 1 · solo planificación · {appConfig.product.tagline}
                </p>
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Chip tone="accent">Fases 1–5 completadas</Chip>
              <Chip tone="pending">Fase 6 preparada · no implementada</Chip>
            </div>
          </div>
          {/* Navegación móvil */}
          <nav aria-label="Índice de secciones" className="lg:hidden">
            <ul className="flex gap-1.5 overflow-x-auto pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {phases.map((p) => (
                <li key={p.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(p.id)}
                    aria-current={active === p.id ? "true" : undefined}
                    className={`rounded-full border px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      active === p.id
                        ? "border-[#c2410c] bg-[#c2410c] text-white"
                        : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
                    }`}
                  >
                    {p.label} · {p.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {/* Contenido */}
      <div className="mx-auto w-full max-w-7xl grow px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Índice lateral (escritorio) */}
          <aside className="hidden lg:block">
            <nav aria-label="Índice de secciones" className="sticky top-24 rounded-xl border border-stone-200 bg-white/80 p-3 shadow-sm">
              <ul className="space-y-0.5">
                {phases.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => goTo(p.id)}
                      aria-current={active === p.id ? "true" : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg border-l-2 px-3 py-2 text-left text-xs font-medium transition-colors ${
                        active === p.id
                          ? "border-[#c2410c] bg-[#fdf1e7] text-[#9a3412]"
                          : "border-transparent text-stone-600 hover:bg-stone-100/70 hover:text-stone-900"
                      }`}
                    >
                      <span aria-hidden className="w-3.5 shrink-0 text-center font-mono text-[10px] text-stone-400">
                        {p.label}
                      </span>
                      <span className="min-w-0 truncate">{p.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-stone-100 px-3 pt-2.5 text-[10px] leading-relaxed text-stone-400">
                Documento canónico: <code>docs/PLAN-MAESTRO.md</code>
              </p>
            </nav>
          </aside>

          {/* Secciones */}
          <main className="min-w-0 space-y-8">
            {/* ── 0 · Resumen ─────────────────────────────── */}
            <SectionShell
              id="resumen"
              number="0"
              title="Resumen ejecutivo"
              intro={
                <p>
                  <strong>VectorTinta</strong> convierte una imagen raster (JPG/PNG/WebP) en SVG editable y la prepara para
                  serigrafía: eliminar fondo <em>en el navegador</em>, recolorear por zonas, separar en capas por color plano
                  y exportar el paquete de tintas (un SVG por capa + <code>manifest.json</code> con el orden de impresión,
                  en ZIP). El procesamiento pesado vive 100 % en el cliente (Web Workers); el backend persiste, autentica,
                  pagina y traza.
                </p>
              }
            >
              <div className="grid gap-3 sm:grid-cols-4">
                <InfoCard title="Procesamiento" tone="accent">
                  WASM + ONNX en Web Workers: la imagen original nunca viaja a un servidor para procesarse.
                </InfoCard>
                <InfoCard title="Extensibilidad">
                  Registros con esquemas Zod: presets, exportadores y operaciones se añaden por configuración (regla del carro).
                </InfoCard>
                <InfoCard title="Escalabilidad">
                  Cursor compuesto en todos los listados, virtualización &gt; 50 nodos, SELECT explícito y complejidad declarada.
                </InfoCard>
                <InfoCard title="Adaptación de entorno" tone="warn">
                  El stack pedido (Vite+Fastify+PG+MinIO) choca con el sandbox real (1 puerto, Next.js 16, SQLite). Puertos y
                  adaptadores hacen del salto a producción una sustitución, no un rediseño (ADR-000/005/006).
                </InfoCard>
              </div>

              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="flex items-start gap-2 text-sm leading-relaxed text-amber-950">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
                  <span>
                    <strong>Honestidad epistémica:</strong> esta iteración es <strong>solo planificación</strong>. No hay
                    implementación del producto (Fase 6 preparada, no inventada). Todo lo verificable estático está verificado
                    con comandos reproducibles; los puntos de runtime (SSIM, &lt;100 ms, persistencia tras recarga) quedan
                    marcados <em>“no verificado hasta implementación”</em> con su protocolo de reproducción.
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: `${endpoints.length}`, v: "endpoints REST con RFC 7807" },
                  { k: "8", v: "entidades con invariantes" },
                  { k: `${adrs.length}`, v: "ADRs con alternativa descartada" },
                  { k: `${liston.length}`, v: "puntos del listón auditados" },
                ].map((s) => (
                  <div key={s.v} className="rounded-xl border border-stone-200 bg-white p-4 text-center shadow-sm">
                    <p className="font-serif text-3xl font-semibold text-[#c2410c]">{s.k}</p>
                    <p className="mt-1 text-[11px] leading-snug text-stone-500">{s.v}</p>
                  </div>
                ))}
              </div>
            </SectionShell>

            {/* ── 1 · Plan estratégico ────────────────────── */}
            <SectionShell
              id="fase-1"
              number="1"
              title="Fase 1 — Plan estratégico"
              intro={
                <p>
                  Objetivo de producto: que un taller pase de “tengo un JPG del cliente” a “tengo mis fotolistos separados
                  por tinta” sin Illustrator ni instalaciones. Actores: diseñador gráfico, operario de taller, cuenta con
                  cuota y visitante evaluador (modo local sin persistencia).
                </p>
              }
            >
              <SubHead hint="el detalle completo vive en docs/PLAN-MAESTRO.md §1">Arquitectura de tres niveles con puertos</SubHead>
              <ArchitectureDiagram />

              <SubHead>Decisiones técnicas — problema / coste / alternativa descartada</SubHead>
              <DataTable
                caption="Decisiones D-01 a D-11"
                rows={decisions}
                columns={[
                  { head: "#", cell: (r) => <span className="font-mono text-[10.5px] text-[#c2410c]">{r.id}</span> },
                  { head: "Decisión", cell: (r) => <strong className="text-stone-800">{r.decision}</strong> },
                  { head: "Problema que resuelve", cell: (r) => r.problema },
                  { head: "Coste asumido", cell: (r) => r.coste },
                  { head: "Alternativa descartada", cell: (r) => <span className="text-stone-500">{r.descartada}</span> },
                ]}
              />

              <SubHead>Riesgos y mitigaciones</SubHead>
              <DataTable
                caption="Riesgos R-01 a R-08"
                rows={risks}
                columns={[
                  { head: "#", cell: (r) => <span className="font-mono text-[10.5px] text-[#c2410c]">{r.n}</span> },
                  { head: "Riesgo", cell: (r) => <strong className="text-stone-800">{r.riesgo}</strong> },
                  { head: "Prob.", cell: (r) => r.prob, className: "w-16" },
                  { head: "Impacto", cell: (r) => r.impacto, className: "w-20" },
                  { head: "Mitigación", cell: (r) => r.mitigacion },
                ]}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard title="Componentes: átomos → moléculas → organismos → página" icon={<Monitor className="size-4 text-stone-500" aria-hidden />}>
                  Átomos: ColorSwatch, StateChip… · Moléculas: PresetSelector (autogenerado del esquema), ColorField, LayerRow
                  (memoizada, key = layer.id), QuotaMeter… · Organismos: AssetPanel, LayerPanel (virtualizado), VectorStage,
                  InkPrepView, InspectorPanel, ProjectsDrawer, DiagnosticsPanel · Página: única ruta visible <code>/</code> con
                  vistas internas por estado.
                </InfoCard>
                <InfoCard title="Estado: Zustand con slices" icon={<Brain className="size-4 text-stone-500" aria-hidden />}>
                  project · tool · history (Command pattern, pila configurable) · export · diagnostics · auth. Estado de
                  servidor con TanStack Query. Redux descartado por boilerplate sin beneficio a este tamaño (ADR-004).
                </InfoCard>
              </div>

              <SubHead>Complejidad declarada de operaciones pesadas</SubHead>
              <InkList
                items={[
                  <>
                    Vectorización: <strong>O(W·H)</strong> muestreo + O(paths) trazado, en worker cancelable; límite{" "}
                    <code>maxPixels</code> de configuración.
                  </>,
                  <>
                    Eliminación de fondo: <strong>O(W·H × modelo)</strong> (ONNX), carga perezosa del modelo con consentimiento
                    visible (10 MiB).
                  </>,
                  <>
                    Separación en capas: <strong>O(paths)</strong> por color exacto; merge forzoso por cercanía si se supera{" "}
                    <code>maxPerVectorization</code> (30, config).
                  </>,
                  <>
                    Listados servidor: <strong>O(log n + limit)</strong> por índice compuesto del cursor; SELECT explícito
                    obligatorio.
                  </>,
                  <>
                    Render del árbol de capas: <strong>O(visible)</strong> con react-window por encima del umbral de
                    configuración (50 nodos).
                  </>,
                ]}
              />
            </SectionShell>

            {/* ── 2 · Modelado ───────────────────────────── */}
            <SectionShell
              id="fase-2"
              number="2"
              title="Fase 2 — Modelado de datos"
              intro={
                <p>
                  Ocho entidades, todas con <code>id</code> UUID y <code>createdAt</code>. Atributos dinámicos en columnas{" "}
                  <code>Json</code> encapsuladas: se validan contra el esquema del registro al escribir y se revalidan con
                  migradores versionados al leer (Fase 4). SQLite sin enums: los “enums” son String validados por Zod en el
                  borde (ADR-005). Cascada de borrado desde <code>Project</code> (unidad de privacidad).
                </p>
              }
            >
              <EntityCards />
              <CodeBlock label="prisma/schema.prisma (Fase 6 preparada; dialecto-agnóstico)" code={PRISMA_SCHEMA} maxHeight="max-h-[480px]" />
              <InkList
                items={[
                  <>
                    Índices de cursor compuestos exactos: <code>(ownerId, createdAt, id)</code> en Project,{" "}
                    <code>(projectId, createdAt, id)</code> en Asset/Export/AuditEvent.
                  </>,
                  <>
                    Únicos: <code>User.email</code>, <code>Asset.storageKey</code>, <code>RefreshToken.tokenHash</code> y{" "}
                    <code>@@unique([vectorizationId, orden])</code> (invariante de capa).
                  </>,
                  <>
                    Migraciones: <code>prisma db push</code> en sandbox (schema-first); <code>prisma migrate dev/deploy</code>{" "}
                    versionadas en producción — el esquema es idéntico salvo <code>provider</code>.
                  </>,
                ]}
              />
            </SectionShell>

            {/* ── 3 · Contratos API ──────────────────────── */}
            <SectionShell
              id="fase-3"
              number="3"
              title="Fase 3 — Contratos API"
              intro={
                <p>
                  REST bajo <code>/api/**</code>. JWT Bearer (jose) + refresh rotatorio con argon2 (ADR-007). Zod{" "}
                  <code>.strict()</code> en body/query. Errores RFC 7807. <strong>Todos los listados con{" "}
                  <code>?limit=&amp;cursor=</code></strong> (default 20, máx 100, config). Recursos ajenos → 404 deliberado
                  (no filtrar existencia). Rate limiting configurable: general 100/min/IP, auth 10/min/IP, mutaciones
                  30/min/usuario.
                </p>
              }
            >
              <DataTable
                caption="Catálogo de endpoints"
                rows={endpoints}
                columns={[
                  {
                    head: "M",
                    cell: (r) => (
                      <span className={`font-mono text-[10px] font-bold ${r.method === "GET" ? "text-[#4a6741]" : "text-[#c2410c]"}`}>
                        {r.method}
                      </span>
                    ),
                    className: "w-14",
                  },
                  { head: "Ruta", cell: (r) => <code className="font-mono text-[11px] text-stone-800">{r.path}</code> },
                  { head: "Auth", cell: (r) => r.auth, className: "w-24" },
                  { head: "Rate", cell: (r) => <span className="text-stone-500">{r.rate}</span>, className: "w-24" },
                  {
                    head: "Pagina",
                    cell: (r) => (r.paginated ? <Chip tone="verified">limit + cursor</Chip> : <span className="text-stone-400">—</span>),
                    className: "w-28",
                  },
                  { head: "Errores típicos", cell: (r) => <span className="text-stone-600">{r.errors}</span> },
                ]}
              />
              <CodeBlock label="Errores: RFC 7807 Problem Details (409 de cuota)" code={PROBLEM_EXAMPLE} maxHeight="max-h-64" />
              <CodeBlock label="Ejemplos de cada clase de error — 401 / 404-ajeno / 413 / 429 / 503" code={ERRORS_EXAMPLE} maxHeight="max-h-96" />
              <CodeBlock label="POST /vectorize — decisión SÍNCRONA documentada" code={VECTORIZE_EXAMPLE} maxHeight="max-h-96" />
              <CodeBlock label="POST /exports — ZIP del cliente + manifest validado" code={MANIFEST_EXAMPLE} maxHeight="max-h-80" />
              <CodeBlock label="GET /projects/:id — reconstrucción tras recarga" code={GET_PROJECT_EXAMPLE} maxHeight="max-h-80" />
              <p className="text-xs leading-relaxed text-stone-500">
                ¿Por qué síncrona? El cálculo pesado ocurre en el cliente; el endpoint persiste el resultado en una
                transacción. Una cola de jobs en v1 sería sobreingeniería (no hay ejecución pesada en servidor). Si se
                registra un motor de servidor en el futuro, el contrato ya reserva el campo <code>job</code> con{" "}
                <code>?async=true</code>.
              </p>
            </SectionShell>

            {/* ── 4 · Inserción extensible ───────────────── */}
            <SectionShell
              id="fase-4"
              number="4"
              title="Fase 4 — Lógica de inserción extensible"
              intro={
                <p>
                  Toda configuración de negocio entra como datos validados contra esquemas registrados. Tres registros
                  comparten contrato (<code>id, label, description, schemaVersion, schema, metadata</code>): PresetRegistry,
                  ExporterRegistry y OperationRegistry (ADR-008). El validador central valida <em>contra el esquema del
                  registro dado</em>, nunca contra una lista fija.
                </p>
              }
            >
              <SubHead>Flujo de validación de un JSON genérico (params / manifest / metadata)</SubHead>
              <FlowSteps
                ariaLabel="Pasos de validación de JSON"
                steps={validationSteps.map((s) => s.detalle.length > 64 ? `${s.paso} · ${s.detalle.slice(0, 61)}…` : `${s.paso} · ${s.detalle}`)}
              />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {validationSteps.map((s) => (
                  <InfoCard key={s.paso} title={s.paso}>
                    {s.detalle}
                  </InfoCard>
                ))}
              </div>

              <SubHead hint="regla 4 del listón: tratamiento diferenciado">Ausente / nulo / inválido / temporal / autorización / configuración / crítico</SubHead>
              <DataTable
                caption="Tratamiento diferenciado de fallos"
                rows={failureModes}
                columns={[
                  { head: "Clase", cell: (r) => <strong className="text-stone-800">{r.clase}</strong>, className: "w-36" },
                  { head: "Ejemplo del producto", cell: (r) => <code className="font-mono text-[10.5px] text-stone-600">{r.ejemplo}</code> },
                  { head: "Tratamiento", cell: (r) => r.tratamiento },
                ]}
              />

              <SubHead>Extensión “cómic” — solo configuración + 1 archivo de esquema</SubHead>
              <FlowSteps
                ariaLabel="Flujo de extensión del preset cómic"
                steps={[
                  "UI: formulario autogenerado desde el esquema del preset",
                  "POST /vectorize { presetId: 'comic', params }",
                  "PresetRegistry.get('comic').schema.safeParse",
                  "Vectorization { presetId:'comic', schemaVersion:1 }",
                  "Render: espejo de capas, sin cambios de núcleo",
                  "ExporterRegistry.get('pdf-capas') → ZIP/PDF + manifest",
                ]}
              />
              <p className="text-xs leading-relaxed text-stone-500">
                Código nuevo: 1 entrada en <code>app.config.ts → vectorization.presetManifest</code> + 1 archivo de esquema
                (y análogo para <code>pdf-capas</code> en <code>export.formats</code>). <strong>Cero cambios</strong> en
                VectorizerService, pipeline, validador central o lienzo.
              </p>
            </SectionShell>

            {/* ── 5 · Renderizado ─────────────────────────── */}
            <SectionShell
              id="fase-5"
              number="5"
              title="Fase 5 — Estrategia de renderizado y listas"
              intro={
                <p>
                  Tres paneles. Iteración dinámica por capas con <code>key = layer.id</code> (nunca índice).{" "}
                  <code>colorHex</code> inválido en datos leídos → color de rescate <code>#FF00FF</code> + chip de
                  diagnóstico: el error se ve, no se camufla. Cada panel implementa carga, vacío, error + reintento,
                  parcial y listo.
                </p>
              }
            >
              <WorkspaceDiagram />

              <SubHead hint="imagen 2000×2000; presupuesto declarado a nivel de diseño (verificación estática)">
                Presupuesto de interacción &lt; 100 ms
              </SubHead>
              <DataTable
                caption="Presupuesto por operación"
                rows={perfBudget}
                columns={[
                  { head: "Operación", cell: (r) => <strong className="text-stone-800">{r.operacion}</strong> },
                  { head: "Mecanismo", cell: (r) => r.mecanismo },
                  { head: "Complejidad", cell: (r) => <code className="font-mono text-[10.5px] text-[#c2410c]">{r.complejidad}</code>, className: "w-32" },
                  { head: "Presupuesto", cell: (r) => <Chip tone="accent">{r.presupuesto}</Chip>, className: "w-32" },
                ]}
              />
              <InkList
                items={[
                  <>
                    <strong>Virtualización:</strong> react-window cuando las capas superan{" "}
                    <code>virtualizationThreshold</code> (50, config); ProjectsDrawer siempre virtualizado (n = 500).
                  </>,
                  <>
                    <strong>Memoización:</strong> <code>React.memo</code> en LayerRow, selectores finos de Zustand por
                    capa, <code>useMemo</code> del árbol visible, mutaciones hot-path por refs al DOM SVG (el color no pasa
                    por React hasta persistir).
                  </>,
                  <>
                    <strong>Undo/redo:</strong> comandos puros serializables (Recolor, RemoveBackground, Toggle, Rename,
                    Reorder) con pila acotada por configuración (100).
                  </>,
                  <>
                    <strong>Persistencia tras recarga:</strong> cada acción confirmada hace PATCH con reintentos;{" "}
                    <code>GET /api/projects/:id</code> reconstruye origen + vectorización + capas + colores.
                  </>,
                ]}
              />
            </SectionShell>

            {/* ── 6 · Fase 6 preparada ───────────────────── */}
            <SectionShell
              id="fase-6"
              number="6"
              title="Fase 6 — Código fuente (PREPARADA, no implementada)"
              intro={
                <p>
                  Por acuerdo del enunciado, esta iteración <strong>no implementa el producto</strong>: se entrega el árbol
                  objetivo, las firmas clave con intención, los comandos exactos y un <strong>artefacto real</strong> —
                  la configuración central validada con Zod, importada en vivo más abajo.
                </p>
              }
            >
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="flex items-start gap-2 text-sm leading-relaxed text-amber-950">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
                  <span>
                    Declaración de estado: ningún archivo de esta lista se presenta como terminado. Los cuerpos NO existen
                    en esta iteración; solo <code>src/lib/config/app.config.ts</code> está completo y validado (y es
                    funcional ahora mismo, como prueba de la regla de cero-hardcoding).
                  </span>
                </p>
              </div>

              <CodeBlock label="Árbol objetivo (Fase 6)" code={FOLDER_TREE} maxHeight="max-h-96" />
              <CodeBlock label="Firmas clave — contratos de implementación" code={SIGNATURES} maxHeight="max-h-96" />
              <CodeBlock label="Comandos exactos" code={COMMANDS} maxHeight="max-h-80" />

              <LiveConfig />
            </SectionShell>

            {/* ── Listón ─────────────────────────────────── */}
            <SectionShell
              id="liston"
              number="★"
              title="Listón de calidad — verificación punto por punto"
              intro={
                <p>
                  Estado por punto del listón con evidencia y forma de reproducirlo. “Pendiente de implementación” es un
                  estado explícito y honesto: la iteración acordada no incluye código de producto, y no se inventan
                  resultados de ejecución.
                </p>
              }
            >
              <div className="space-y-3">
                {liston.map((item) => (
                  <ListonRow key={item.n} item={item} />
                ))}
              </div>
            </SectionShell>

            {/* ── Árbitro ────────────────────────────────── */}
            <SectionShell
              id="arbitro"
              number="⚖"
              title="Informe del árbitro"
              intro={
                <p>
                  La Ronda 0 es la autoauditoría del orquestador con comandos reales. La Ronda 1 corresponde al{" "}
                  <strong>subagente árbitro adversarial independiente</strong> (Task ARB-1) que audita esta entrega contra el
                  listón completo antes del cierre. {arbiterResumen.nota}
                </p>
              }
            >
              <div className="space-y-4">
                {arbiterRounds.map((r) => (
                  <article key={r.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
                    <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-serif text-base font-semibold text-stone-900">{r.id}</h3>
                      <Chip tone={r.veredicto === "pasada" ? "verified" : r.veredicto === "rechazada" ? "pending" : "accent"}>
                        veredicto: {r.veredicto}
                      </Chip>
                    </header>
                    <p className="mb-3 text-xs text-stone-500">{r.rol}</p>

                    {r.hallazgos.length > 0 ? (
                      <div className="mb-4">
                        <SubHead>Hallazgos y correcciones</SubHead>
                        <ul className="space-y-2">
                          {r.hallazgos.map((h) => (
                            <li key={h.asunto} className="rounded-lg border border-stone-200 bg-[#faf7f2] p-3">
                              <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-800">
                                <Chip tone={h.severidad === "alto" ? "pending" : h.severidad === "medio" ? "accent" : "neutral"}>
                                  severidad {h.severidad}
                                </Chip>
                                {h.asunto}
                              </p>
                              <p className="mb-1.5 text-xs leading-relaxed text-stone-600">{h.detalle}</p>
                              <p className="text-xs leading-relaxed text-[#3a5333]">
                                <strong>Acción:</strong> {h.accion}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <SubHead>
                          <span className="inline-flex items-center gap-1.5">
                            <CircleCheck className="size-4 text-[#4a6741]" aria-hidden /> Verificado
                          </span>
                        </SubHead>
                        <ul className="space-y-1.5">
                          {r.verificado.map((v) => (
                            <li key={v} className="flex gap-2 text-xs leading-relaxed text-stone-600">
                              <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-[#4a6741]" aria-hidden />
                              {v}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <SubHead>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="size-4 text-amber-700" aria-hidden /> No verificado (y por qué)
                          </span>
                        </SubHead>
                        <ul className="space-y-1.5">
                          {r.noVerificado.map((v) => (
                            <li key={v} className="flex gap-2 text-xs leading-relaxed text-stone-600">
                              <Clock3 className="mt-0.5 size-3.5 shrink-0 text-amber-700" aria-hidden />
                              {v}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </SectionShell>

            {/* ── Anexos ─────────────────────────────────── */}
            <SectionShell
              id="anexos"
              number="A"
              title="Anexos — entregables del repositorio"
              intro={<p>Todo el material de esta entrega vive en el repositorio y es reproducible con los comandos indicados.</p>}
            >
              <DataTable
                caption="Índice de documentación"
                rows={docsIndex}
                columns={[
                  { head: "Ruta", cell: (r) => <code className="font-mono text-[11px] text-[#9a3412]">{r.ruta}</code> },
                  { head: "Contenido", cell: (r) => r.contenido },
                ]}
              />

              <SubHead hint="imágenes sintéticas generadas con IA, documentadas como tal">Fixtures de verificación perceptual</SubHead>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { src: "/fixtures/caso-1-logo-plano.png", alt: "Gráfico plano de montañas con 4 colores planos para vectorizar", cap: "Caso 1 · gráfico plano (SSIM esperable ≥ 0,95)" },
                  { src: "/fixtures/caso-2-producto-fondo-removible.png", alt: "Fotografía de producto sobre fondo plano para eliminar el fondo", cap: "Caso 2 · producto con fondo removible" },
                  { src: "/fixtures/caso-3-cartel-serigrafia.png", alt: "Cartel estilo serigrafía con 5 colores planos y trama de puntos", cap: "Caso 3 · cartel serigráfico con trama" },
                ].map((f) => (
                  <figure key={f.src} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                    <img src={f.src} alt={f.alt} className="aspect-square w-full object-cover" loading="lazy" />
                    <figcaption className="px-3 py-2 text-[11px] leading-snug text-stone-600">{f.cap}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-stone-500">
                Protocolos reproducibles (SSIM ≥ 0,92; medición p50/p95 de interacción; reversibilidad del alfa) en{" "}
                <code>docs/fixtures/README.md</code>. Fuentes Mermaid en <code>docs/diagrams/</code>.
              </p>

              <SubHead>ADRs (resumen; texto completo en docs/decisions/)</SubHead>
              <Accordion type="single" collapsible className="rounded-xl border border-stone-200 bg-white px-4">
                {adrs.map((a) => (
                  <AccordionItem key={a.id} value={a.id} className="border-b border-stone-100 last:border-0">
                    <AccordionTrigger className="py-3.5 text-left font-serif text-sm font-semibold hover:no-underline">
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-[10.5px] font-bold text-[#c2410c]">{a.id}</span>
                        <span className="text-stone-800">{a.title}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 text-xs leading-relaxed text-stone-600">
                      {a.gist}
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-stone-400">
                        <FileSearch className="size-3" aria-hidden /> docs/decisions/{a.file}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </SectionShell>
          </main>
        </div>
      </div>

      {/* Pie */}
      <footer className="mt-auto border-t border-stone-200/80 bg-[#f5f1ea]">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-serif text-sm font-semibold text-stone-900">
                {appConfig.product.name} — Plan Maestro v1.0 · Iteración 1: solo planificación
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                Fase 6 preparada, no implementada · verificación estática con protocolos reproducibles · docs/PLAN-MAESTRO.md ·
                docs/decisions/ · docs/diagrams/ · docs/fixtures/
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Chip>digest {configDigest} validado</Chip>
              <Chip tone="ink">Zod en arranque</Chip>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Fila del listón ────────────────────────────────────────── */

function ListonRow({ item }: { item: (typeof liston)[number] }) {
  const meta: Record<ListonStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    verificado: {
      label: "Verificado (estático, reproducible)",
      cls: "border-[#4a6741]/40 bg-[#4a6741]/10 text-[#3a5333]",
      icon: <CircleCheck className="size-3.5" aria-hidden />,
    },
    estatico: {
      label: "Verificado en diseño",
      cls: "border-[#c2410c]/30 bg-[#fdf1e7] text-[#9a3412]",
      icon: <CircleCheck className="size-3.5" aria-hidden />,
    },
    pendiente: {
      label: "Pendiente de implementación",
      cls: "border-amber-300 bg-amber-50 text-amber-900",
      icon: <Clock3 className="size-3.5" aria-hidden />,
    },
  };
  const m = meta[item.status];
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-baseline gap-2 break-words text-sm font-semibold text-stone-900">
          <span className="font-mono text-[10.5px] font-bold text-[#c2410c]">{String(item.n).padStart(2, "0")}</span>
          {item.punto}
        </h3>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${m.cls}`}>
          {m.icon}
          {m.label}
        </span>
      </div>
      <p className="text-xs leading-relaxed break-words text-stone-600">
        <strong className="text-stone-700">Evidencia:</strong> {item.evidencia}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">
        <strong className="text-stone-600">Reproducir:</strong> <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[10.5px] break-all">{item.reproduccion}</code>
      </p>
    </article>
  );
}
