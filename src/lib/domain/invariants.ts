/**
 * VectorTinta — Invariantes puras del dominio (plan §2.2).
 *
 * Funciones ISOMORFAS sin efectos: las usan las rutas API (antes de escribir)
 * y el cliente (antes de ofrecer/confirmar una acción). Ninguna lanza;
 * devuelven booleanos/valores para que el llamante decida el problema exacto.
 */
import { appConfig } from "@/lib/config/app.config";
import { ColorHexSchema, type VectorParams } from "@/lib/domain/entities";

const L = appConfig.limits;

/** `#RRGGBB` válido según el contrato compartido. */
export function isValidColorHex(value: unknown): boolean {
  return ColorHexSchema.safeParse(value).success;
}

/** `orden` entero dentro de [0, maxPerVectorization). */
export function isValidOrden(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < L.layers.maxPerVectorization;
}

/** Área en píxeles ≥ 0 y dentro del rango físico de la imagen. */
export function isValidAreaPx(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= L.image.maxPixels;
}

/** Cantidad de capas dentro del máximo por vectorización (config). */
export function withinMaxLayers(count: number): boolean {
  return count >= 1 && count <= L.layers.maxPerVectorization;
}

/** Bytes de una subida dentro del máximo (config, S-01). */
export function withinMaxUploadBytes(bytes: number): boolean {
  return bytes > 0 && bytes <= L.image.maxUploadBytes;
}

/** Dimensiones dentro del máximo por lado (config). */
export function withinMaxDimension(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= L.image.maxDimension && height <= L.image.maxDimension;
}

/** MIME permitido para subidas (config). */
export function isAllowedImageMime(mime: unknown): mime is "image/jpeg" | "image/png" | "image/webp" {
  return typeof mime === "string" && (appConfig.limits.image.allowedMimeTypes as string[]).includes(mime);
}

/** sha-256 en hex de 64 caracteres. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Nombre de capa sugerido a partir del HEX: lo más cercano en la paleta de
 * tintas de configuración (distancia RGB). Sin nombre → "Capa {orden:02d}".
 * Los NOMBRES de tinta viven en configuración, no en código (regla 1).
 */
export function suggestInkName(colorHex: string, orden: number): string {
  const target = hexToRgb(colorHex);
  if (!target) return `Capa ${String(orden).padStart(2, "0")}`;
  let best: { name: string; dist: number } | null = null;
  for (const ink of appConfig.colors.inkPalette) {
    const rgb = hexToRgb(ink.hex);
    if (!rgb) continue;
    const dist = (rgb.r - target.r) ** 2 + (rgb.g - target.g) ** 2 + (rgb.b - target.b) ** 2;
    if (best === null || dist < best.dist) best = { name: ink.name, dist };
  }
  return best ? best.name : `Capa ${String(orden).padStart(2, "0")}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isValidColorHex(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Luminosidad relativa (0..1) — usada por la estrategia `by-lightness` del orden de impresión. */
export function relativeLightness(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

/** Los params completan los 6 campos comunes y respetan la cota global (config). */
export function isCompleteVectorParams(value: unknown): value is VectorParams {
  return (
    typeof value === "object" &&
    value !== null &&
    "colorPrecision" in value &&
    "filterSpeckle" in value &&
    "cornerThreshold" in value &&
    "lengthThreshold" in value &&
    "mode" in value &&
    "maxColors" in value
  );
}
