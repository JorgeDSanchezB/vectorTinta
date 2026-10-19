/**
 * VectorTinta — Contratos compartidos cliente/servidor (Fase 3 canónica, plan §3.3).
 *
 * Módulo ISOMORFO: lo importan las rutas API (Next) y el cliente (navegador).
 * Regla del listón: ninguna forma de respuesta se duplica en ad-hoc JSON;
 * TODO dto de aquí espeja el ejemplo canónico del plan §3.3 (o una extensión
 * documentada en docs/decisions/ADR-012-deltas-implementacion.md).
 */
import { z } from "zod";

/* ───────────────────────── Tipos base ───────────────────────── */

/** HEX de color plano compartido con `Layer.colorHex` (fuente: app.config). */
export const ColorHexSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color plano esperado como #RRGGBB");

/**
 * Engines de vectorización reconocidos por el sistema (plan §4.3: desconocido
 * → 400 enumerable). 'imagetracer-js' = implementación propia (audited-ok);
 * 'vtracer-wasm' = motor externo bloqueado con licencia 'pending-audit'.
 */
export const VECTOR_ENGINE_IDS = ["imagetracer-js", "vtracer-wasm"] as const;
export type VectorEngineId = (typeof VECTOR_ENGINE_IDS)[number];

/** Fecha ISO-8601 UTC serializada en JSON. */
export const IsoDate = z.string().datetime({ offset: true });

/* ───────────────────────── Parámetros de vectorización ───────────────────────── */

/** Los 6 campos comunes a TODO preset (cota global en app.config → VectorParamsSchema). */
export interface VectorParams {
  colorPrecision: number; // bits de precisión por canal (1..8)
  filterSpeckle: number; // área mínima de región en px² (1..64)
  cornerThreshold: number; // ángulo de esquina en grados (0..180)
  lengthThreshold: number; // longitud mínima de segmento en px (1..100)
  mode: "spline" | "polygon";
  maxColors: number; // nº máximo de colores planos (1..64)
}

/* ───────────────────────── DTOs de respuesta ───────────────────────── */

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  plan: "free" | "pro";
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Ítem del listado de proyectos (plan §3.3 GET /api/projects). */
export interface ProjectListItemDto extends ProjectDto {
  thumbnailUrl: string | null;
  layerCount: number;
}

export type AssetRole = "source" | "result" | "thumbnail";

export interface AssetDto {
  id: string;
  projectId: string;
  role: AssetRole;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  bytes: number;
  checksum: string;
  downloadUrl: string;
  createdAt: string;
}

export interface VectorizationDto {
  id: string;
  presetId: string;
  engineId: string;
  params: VectorParams;
  paramsSchemaVersion: number;
  nodeCount: number;
  svgUrl: string;
  createdAt: string;
}

export interface LayerDto {
  id: string;
  vectorizationId: string;
  orden: number;
  colorHex: string;
  name: string;
  areaPx: number;
  visible: boolean;
  svgFragmentUrl: string;
  createdAt: string;
}

export interface ExportDto {
  id: string;
  projectId: string;
  formatId: string;
  downloadUrl: string;
  createdAt: string;
}

/** Listado paginado por cursor compuesto (ADR-010, plan §3.1). */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Respuesta de register/login/refresh/guest (plan §3.3 POST /api/auth/register). */
export interface AuthResponseDto {
  user: UserDto;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number; // segundos (coincide con server.config → accessTokenTtl)
}

/** GET /api/projects/:id — reconstrucción del espacio de trabajo tras recarga (plan §3.3). */
export interface ProjectWorkspaceDto {
  project: ProjectDto;
  assets: AssetDto[];
  vectorization: VectorizationDto | null;
  layers: LayerDto[];
}

/** GET /api/health (plan §3.3). */
export interface HealthDto {
  status: "ok" | "degradado";
  db: "up" | "down";
  configDigest: string;
  version: string;
}

/** GET /api/metrics (contadores en memoria; prod: adaptador Prometheus). */
export interface MetricsDto {
  uptimeSeconds: number;
  requestsByCode: Record<string, number>;
  vectorizationsPersisted: number;
  exportsByFormat: Record<string, number>;
}

/* ───────────────────────── Salidas de los motores cliente ───────────────────────── */

/** Imagen RGBA sin depender de la API del DOM (serializable a un Worker). */
export interface RawImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray; // longitud = width*height*4
}

/** Capa recién producida por el vectorizador (borrador; el servidor le da id). */
export interface LayerDraft {
  orden: number;
  colorHex: string;
  name: string;
  areaPx: number;
  fragmentSvg: string; // <svg><path …/></svg> con un solo color plano
}

export interface VectorizeResult {
  svg: string; // composición completa (todos los grupos por capa)
  nodeCount: number; // nodos geométricos totales (suma de los puntos de control)
  layers: LayerDraft[];
}

export interface BgRemovalResult {
  alphaMask: RawImageData; // 0 = transparente, 255 = opaco (reversible: es un comando del historial)
  removedPx: number;
  totalPx: number;
}
