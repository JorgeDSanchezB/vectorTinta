"use client";

/**
 * VectorTinta — Adaptación automática de imágenes que exceden los límites de
 * subida (ADR-013; límites de `appConfig.limits.image`, NUNCA constantes propias).
 *
 * Por qué existe: rechazar con 413 una foto de móvil reciente (JPEG de 20-40 MiB
 * o PNG de diseño a 6000 px) rompía el flujo del taller. La subida se acepta
 * ADAPTANDO la imagen en el navegador ANTES de enviarla:
 *
 *   1. Escalar al máximo por lado (`maxDimension`) preservando proporción.
 *   2. Recodificar con escalera de calidad/dimensión hasta que el peso entre
 *      en `maxUploadBytes` (el servidor revalida todo: MIME, dimensiones y
 *      sha-256 del resultado, no del original).
 *
 * Transparencia (cognición honesta): quien llama informa al usuario con un
 * toast de que la imagen se adaptó y con qué valores exactos.
 *
 * Preservación de alfa: si la imagen tiene alfa (o era PNG), se recodifica a
 * WebP (admite alfa) o PNG — nunca a JPEG, que lo destruiría.
 */
import { appConfig } from "@/lib/config/app.config";

const LIMITS = appConfig.limits.image;

/** Pasos de recodificación con pérdida, del más fiel al más agresivo. */
const LOSSY_LADDER: { mime: "image/jpeg" | "image/webp"; quality: number }[] = [
  { mime: "image/jpeg", quality: 0.92 },
  { mime: "image/webp", quality: 0.92 },
  { mime: "image/jpeg", quality: 0.82 },
  { mime: "image/webp", quality: 0.80 },
  { mime: "image/jpeg", quality: 0.70 },
  { mime: "image/webp", quality: 0.65 },
];

/** Factores de reducción de dimensiones (sobre el lado ya ajustado a maxDimension). */
const DIM_FACTORS = [1, 0.8, 0.64, 0.5, 0.4];

/** Suelo de dimensiones: por debajo, el arte deja de ser útil para serigrafía. */
const MIN_SIDE_PX = 256;

export interface FitImageInput {
  /** Blob original (solo para saber su peso real y nombre). */
  blob: Blob;
  fileName: string;
  /** Bitmap YA decodificado por el llamante (evita decodificar dos veces). */
  bitmap: ImageBitmap;
  /** ¿La imagen tiene alfa significativo? (decide los formatos de salida). */
  hasAlpha: boolean;
}

export interface FittedImage {
  /** Archivo final listo para subir: dentro de límites y con MIME permitido. */
  file: File;
  width: number;
  height: number;
  outputMime: string;
}

/** Escala el bitmap al tamaño indicado y recodifica; null si el navegador no puede. */
function encodeScaled(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  mime: string,
  quality?: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

function isAllowedMime(mime: string): boolean {
  return (LIMITS.allowedMimeTypes as string[]).includes(mime);
}

/** Cambia la extensión del nombre al MIME de salida (foto.png → foto.webp). */
function swapExtension(fileName: string, mime: string): string {
  const ext = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/u, "");
  return `${base.length > 0 ? base : "imagen"}.${ext}`;
}

/**
 * Adapta una imagen decodificada a los límites de subida de configuración.
 * Lanza Error con mensaje accionable solo si ningún candidato cabe (no debería
 * ocurrir: 256px en WebP q0.65 pesa decenas de KiB).
 */
export async function fitImageToUploadLimits(input: FitImageInput): Promise<FittedImage> {
  const { blob, fileName, bitmap, hasAlpha } = input;
  const bytesProblem = blob.size > LIMITS.maxUploadBytes;
  const dimsProblem = Math.max(bitmap.width, bitmap.height) > LIMITS.maxDimension;

  // Ajuste al máximo por lado (proporción preservada).
  const fitScale = Math.min(1, LIMITS.maxDimension / Math.max(bitmap.width, bitmap.height));
  const fittedW = Math.max(1, Math.round(bitmap.width * fitScale));
  const fittedH = Math.max(1, Math.round(bitmap.height * fitScale));

  // Plan de codificación: si el problema es SOLO de dimensiones, intentamos
  // PNG (sin pérdida) primero; si además pesa demasiado, pérdida desde el inicio.
  const candidates: { mime: string; quality?: number }[] = [];
  if (!bytesProblem && dimsProblem) {
    candidates.push({ mime: "image/png" });
  }
  for (const step of LOSSY_LADDER) {
    // Con alfa, JPEG está prohibido (lo destruye): solo WebP.
    if (hasAlpha && step.mime === "image/jpeg") continue;
    candidates.push(step);
  }
  candidates.push({ mime: "image/png" }); // último recurso sin pérdida (alpha-safe).

  for (const factor of DIM_FACTORS) {
    const w = Math.max(1, Math.round(fittedW * factor));
    const h = Math.max(1, Math.round(fittedH * factor));
    if (Math.max(w, h) < MIN_SIDE_PX) break; // no degradamos hasta lo inútil.
    for (const candidate of candidates) {
      const out = await encodeScaled(bitmap, w, h, candidate.mime, candidate.quality);
      // toBlob puede devolver null o ignorar el MIME pedido → validar tipo real.
      if (out === null || out.size === 0 || !isAllowedMime(out.type)) continue;
      if (out.size <= LIMITS.maxUploadBytes && w <= LIMITS.maxDimension && h <= LIMITS.maxDimension) {
        return {
          file: new File([out], swapExtension(fileName, out.type), { type: out.type, lastModified: Date.now() }),
          width: w,
          height: h,
          outputMime: out.type,
        };
      }
    }
  }

  throw new Error(
    `No se pudo adaptar la imagen a los límites (${Math.round(LIMITS.maxUploadBytes / 1048576)} MiB · ${LIMITS.maxDimension}px).`,
  );
}

/** 1536 KiB → "1.5 MiB"; 450 KiB → "450 KiB" (para toasts honestos). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MiB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}
