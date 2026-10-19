/**
 * VectorTinta — Mapeo fila→DTO y autorización de recursos (plan §3.3).
 *
 * Reglas del módulo:
 *  - SELECT explícito SIEMPRE (los `const …_SELECT` de aquí son el catálogo
 *    canónico de columnas por endpoint; ninguna ruta hace `findMany` a ciegas).
 *  - Propiedad: todo recurso bajo /api/projects/:id verifica ownerId === sub.
 *    Ajeno o inexistente → 404 con el MISMO cuerpo (no se filtra existencia).
 *  - Fechas → ISO-8601; URLs de descarga → firmadas por el adaptador local.
 *  - Vectorization.params se revalida al LEER con MigrationRegistry (plan §2.4):
 *    v1 = identidad; JSON corrupto → ApiConfigError (clase CONFIG), nunca se
 *    "arregla" en silencio.
 */
import { ApiProblem, makeProblem } from "@/lib/domain/errors";
import type {
  AssetDto,
  ExportDto,
  LayerDto,
  ProjectDto,
  ProjectListItemDto,
  VectorizationDto,
} from "@/lib/domain/entities";
import { db } from "@/lib/db";
import { localStorage } from "@/lib/storage/local";
import { ApiConfigError, MigrationRegistry } from "@/lib/registries/migrations";
import { presetRegistry } from "@/lib/registries/preset-registry";
import type { Prisma } from "@prisma/client";

/* ─────────────────────── SELECTs canónicos por endpoint ─────────────────────── */

export const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  thumbnailKey: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ProjectSelect;

export const ASSET_SELECT = {
  id: true,
  projectId: true,
  role: true,
  mimeType: true,
  width: true,
  height: true,
  bytes: true,
  storageKey: true,
  checksum: true,
  createdAt: true,
} as const satisfies Prisma.AssetSelect;

export const LAYER_SELECT = {
  id: true,
  vectorizationId: true,
  orden: true,
  colorHex: true,
  name: true,
  svgFragmentKey: true,
  areaPx: true,
  visible: true,
  createdAt: true,
} as const satisfies Prisma.LayerSelect;

export const VECTORZ_SELECT = {
  id: true,
  assetId: true,
  engineId: true,
  presetId: true,
  params: true,
  paramsSchemaVersion: true,
  svgStorageKey: true,
  nodeCount: true,
  createdAt: true,
} as const satisfies Prisma.VectorizationSelect;

export const EXPORT_SELECT = {
  id: true,
  projectId: true,
  formatId: true,
  storageKey: true,
  manifest: true,
  manifestSchemaVersion: true,
  createdAt: true,
} as const satisfies Prisma.ExportSelect;

/* ─────────────────────────── 404 uniforme (ajeno/inexistente) ─────────────────────────── */

/** 404 canónico del plan §3.3: mismo cuerpo para inexistente y ajeno. */
export function projectNotFound(projectId: string, instance: string): ApiProblem {
  void projectId;
  return new ApiProblem(
    makeProblem("no-encontrado", {
      title: "Proyecto no disponible",
      detail: "El proyecto no existe o no es tuyo.",
      instance,
    }),
  );
}

/**
 * Carga un proyecto y exige propiedad. Inexistente o ajeno → 404 idéntico
 * (política anti-filtrado de existencia del plan §3.1/§3.3).
 */
export async function requireOwnedProject(
  userId: string,
  projectId: string,
  instance: string,
): Promise<Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>> {
  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: userId },
    select: PROJECT_SELECT,
  });
  if (project === null) throw projectNotFound(projectId, instance);
  return project;
}

/* ─────────────────────────────── DTOs ─────────────────────────────── */

export function projectDto(
  row: Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>,
): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function projectListItemDto(
  row: Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>,
  layerCount: number,
): Promise<ProjectListItemDto> {
  return {
    ...projectDto(row),
    thumbnailUrl:
      row.thumbnailKey !== null ? await localStorage.signedPath(row.thumbnailKey) : null,
    layerCount,
  };
}

export async function assetDto(
  row: Prisma.AssetGetPayload<{ select: typeof ASSET_SELECT }>,
): Promise<AssetDto> {
  return {
    id: row.id,
    projectId: row.projectId,
    role: row.role as AssetDto["role"],
    mimeType: row.mimeType as AssetDto["mimeType"],
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    checksum: row.checksum,
    downloadUrl: await localStorage.signedPath(row.storageKey),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function layerDto(
  row: Prisma.LayerGetPayload<{ select: typeof LAYER_SELECT }>,
): Promise<LayerDto> {
  return {
    id: row.id,
    vectorizationId: row.vectorizationId,
    orden: row.orden,
    colorHex: row.colorHex,
    name: row.name,
    areaPx: row.areaPx,
    visible: row.visible,
    svgFragmentUrl: await localStorage.signedPath(row.svgFragmentKey),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function exportDto(
  row: Prisma.ExportGetPayload<{ select: typeof EXPORT_SELECT }>,
): Promise<ExportDto> {
  return {
    id: row.id,
    projectId: row.projectId,
    formatId: row.formatId,
    downloadUrl: await localStorage.signedPath(row.storageKey),
    createdAt: row.createdAt.toISOString(),
  };
}

/* ────────────────── Revalidación/migración de params al leer ────────────────── */

/** Cadena de migradores de params: v1 = identidad (no hay versiones antiguas). */
const VECTOR_PARAMS_MIGRATIONS = new MigrationRegistry<Record<string, unknown>>();

/**
 * Lee `Vectorization.params` con el protocolo del plan §2.4/§4.2 paso 7:
 * migrar si la versión almacenada es menor que la vigente del preset y
 * REVALIDAR contra el esquema del registro. Corrupto → ApiConfigError.
 */
export function readVectorParams(
  presetId: string,
  params: Prisma.JsonValue,
  paramsSchemaVersion: number,
): Record<string, unknown> {
  const entry = presetRegistry.get(presetId);
  if (entry === undefined) {
    // Preset eliminado de la configuración con datos huérfanos: clase CONFIG.
    throw new ApiConfigError(`El preset "${presetId}" ya no está registrado`);
  }
  const current = entry.schemaVersion;
  const raw = (params ?? {}) as Record<string, unknown>;
  const migrated =
    paramsSchemaVersion < current
      ? VECTOR_PARAMS_MIGRATIONS.migrate(raw, paramsSchemaVersion, current)
      : raw;
  const parsed = entry.schema.safeParse(migrated);
  if (!parsed.success) {
    throw new ApiConfigError(
      `params almacenados no validan contra el esquema v${current} del preset "${presetId}"`,
    );
  }
  return parsed.data as Record<string, unknown>;
}

/** DTO de vectorización con params revalidados y svgUrl firmada. */
export async function vectorizationDto(
  row: Prisma.VectorizationGetPayload<{ select: typeof VECTORZ_SELECT }>,
): Promise<VectorizationDto> {
  const params = readVectorParams(row.presetId, row.params, row.paramsSchemaVersion);
  return {
    id: row.id,
    presetId: row.presetId,
    engineId: row.engineId,
    params: params as unknown as VectorizationDto["params"],
    paramsSchemaVersion: row.paramsSchemaVersion,
    nodeCount: row.nodeCount,
    svgUrl: await localStorage.signedPath(row.svgStorageKey),
    createdAt: row.createdAt.toISOString(),
  };
}
