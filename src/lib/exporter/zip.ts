/**
 * VectorTinta — Empaquetado ZIP (fflate) para el exportador serigráfico.
 *
 * CLIENTE-SEGURO: fflate corre en Worker y en hilo principal sin dependencias
 * de servidor. Nivel de compresión 6 (equilibrio del taller: SVG de texto se
 * comprime muy bien sin coste perceptible en imágenes de ≤ 30 capas).
 */
import { zipSync } from "fflate";

export interface ZipFileEntry {
  name: string;
  bytes: Uint8Array;
}

/**
 * Construye el ZIP in-memory: entrada = archivos en orden determinista
 * (capas en orden de impresión + manifest al final), salida = bytes del ZIP.
 * Lanza Error si hay nombres duplicados (evita sobreescrituras silenciosas).
 */
export function buildZip(files: ZipFileEntry[]): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  for (const file of files) {
    if (Object.prototype.hasOwnProperty.call(data, file.name)) {
      throw new Error(`Nombre de archivo duplicado en el ZIP: ${file.name}`);
    }
    data[file.name] = file.bytes;
  }
  return zipSync(data, { level: 6 });
}
