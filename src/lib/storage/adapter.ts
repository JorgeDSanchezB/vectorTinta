/**
 * VectorTinta — Puerto de almacenamiento (plan §6.2).
 *
 * El núcleo nunca habla con `fs` ni con S3: habla con ESTE puerto. El salto a
 * producción (S3/MinIO) es sustitución del adaptador `local.ts`, no rediseño
 * (ADR-006). Se añade `exists` y acceso a Buffer para las rutas de subida
 * (revalidación sha-256 con sharp), documentado como extensión del contrato.
 */
import type { ReadableStream } from "node:stream/web";

export interface PutResult {
  key: string;
  bytes: number;
}

export interface StorageAdapter {
  /** Escribe un blob bajo la clave; el checksum viaja para trazabilidad. */
  put(key: string, data: Blob, meta: { checksum: string }): Promise<PutResult>;
  /** Lee el contenido como stream (streaming al cliente, plan §3.2). */
  getStream(key: string): Promise<ReadableStream<Uint8Array>>;
  /** Borrado por clave (idempotente en adaptadores de objeto). */
  delete(key: string): Promise<void>;
  /** Token de acceso firmado para la clave (URL relativa servida por la API). */
  sign(key: string, ttlSeconds: number): Promise<string>;
  /** Existencia del objeto (usado por el borrado en cascada best-effort). */
  exists(key: string): Promise<boolean>;
}

/** Convención fija de claves del dominio (espejo del plan §6.1/ADR-012). */
export const STORAGE_KEYS = {
  /** Imagen original subida por rol 'source' (ext según MIME real). */
  source: (projectId: string, assetId: string, ext: string) =>
    `projects/${projectId}/sources/${assetId}.${ext}`,
  /** Miniatura declarada por el cliente (PNG en el caso canónico). */
  thumbnail: (projectId: string, assetId: string, ext: string) =>
    `projects/${projectId}/thumbnails/${assetId}.${ext}`,
  /** Resultado de exportaciones de tipo mockup PNG. */
  result: (projectId: string, assetId: string, ext: string) =>
    `projects/${projectId}/results/${assetId}.${ext}`,
  /** Composición SVG completa de una vectorización. */
  vectorSvg: (projectId: string, vectorizationId: string) =>
    `projects/${projectId}/vectors/${vectorizationId}.svg`,
  /** Fragmento SVG de una capa. */
  layerFragment: (projectId: string, layerId: string) =>
    `projects/${projectId}/layers/${layerId}.svg`,
  /** Blob ZIP de una exportación serigráfica. */
  exportZip: (projectId: string, exportId: string) =>
    `projects/${projectId}/exports/${exportId}.zip`,
  /** Mockup PNG generado por el formato png-mockup. */
  exportMockup: (projectId: string, exportId: string) =>
    `projects/${projectId}/mockups/${exportId}.png`,
  /** Directorio físico del proyecto (borrado en cascada, best-effort). */
  projectDir: (projectId: string) => `projects/${projectId}`,
} as const;

/** Content-Type por extensión (convención fija del dominio de archivos). */
export function contentTypeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "zip":
      return "application/zip";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}
