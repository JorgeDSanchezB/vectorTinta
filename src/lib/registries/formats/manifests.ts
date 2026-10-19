/**
 * VectorTinta — Esquemas de los manifests de exportación (plan §3.3 + §4.1).
 *
 * El exportador del CLIENTE construye el manifest y lo valida contra ESTE
 * esquema antes de subir; el SERVIDOR lo revalida en POST /exports contra el
 * MISMO esquema del ExporterRegistry. Esquema compartido = cero divergencia.
 */
import { z } from "zod";
import { ColorHexSchema } from "@/lib/domain/entities";
import { appConfig } from "@/lib/config/app.config";

const filePattern = appConfig.export.filePattern; // tokens declarados en §9 del plan
const inkMarkPattern = appConfig.export.inkMarkPattern;

/* ── ZIP serigráfico (un SVG por tinta + manifest.json) ── */

export const PrintOrderEntrySchema = z.strictObject({
  layerId: z.string().min(1),
  order: z.number().int().min(0),
  fileName: z.string().min(3), // se ajusta a export.filePattern
  colorHex: ColorHexSchema,
  colorName: z.string().min(1).max(80),
  inkMark: z.string().min(3), // se ajusta a export.inkMarkPattern
  areaPx: z.number().int().min(0),
  coveragePercent: z.number().min(0).max(100),
  visible: z.literal(true), // solo entran capas visibles (las ocultas quedan excluidas)
});

export const ZipSerigrafiaManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projectId: z.string().min(1),
  printOrder: z.array(PrintOrderEntrySchema).min(1),
  strategy: z.enum(["by-area-desc", "by-lightness"]), // = export.printOrderStrategy
  source: z.strictObject({
    presetId: z.string().min(1),
    engineId: z.string().min(1),
    assetId: z.string().min(1),
  }),
  excludedLayers: z
    .array(z.strictObject({ layerId: z.string().min(1), reason: z.string().min(1).max(80) }))
    .default([]),
  patternInfo: z.strictObject({ filePattern: z.string().min(3), inkMarkPattern: z.string().min(3) }),
});

export type ZipSerigrafiaManifest = z.infer<typeof ZipSerigrafiaManifestSchema>;

/* ── Mockup PNG (composición plana para aprobar el arte) ── */

export const PngMockupManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projectId: z.string().min(1),
  canvasSize: z.strictObject({ width: z.number().int().min(1), height: z.number().int().min(1) }),
  layerCount: z.number().int().min(1),
  colors: z.array(ColorHexSchema).min(1),
  source: z.strictObject({
    presetId: z.string().min(1),
    engineId: z.string().min(1),
    assetId: z.string().min(1),
  }),
});

export type PngMockupManifest = z.infer<typeof PngMockupManifestSchema>;

/** Patrón del nombre de archivo: rellena {orden:02d}, {colorHex}, {layerId}. */
export function renderFilePattern(orden: number, colorHex: string, layerId: string): string {
  return filePattern
    .replaceAll("{orden:02d}", String(orden).padStart(2, "0"))
    .replaceAll("{colorHex}", colorHex)
    .replaceAll("{layerId}", layerId);
}

/** Patrón de la marca de tinta única: rellena {orden:02d}, {colorHex}. */
export function renderInkMark(orden: number, colorHex: string): string {
  return inkMarkPattern
    .replaceAll("{orden:02d}", String(orden).padStart(2, "0"))
    .replaceAll("{colorHex}", colorHex);
}
