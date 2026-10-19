/**
 * VectorTinta — Campos comunes de los presets de vectorización (plan §4.4).
 *
 * Un preset NUEVO puede AÑADIR campos propios (p. ej. 'comic' → strokeWidth)
 * extendiendo `CommonVectorParamsSchema`; el inspector genera el formulario
 * desde `FieldMeta[]` (label/min/max/step/unidad), por lo que la UI del
 * preset nuevo sale gratis (regla de extensibilidad del listón).
 */
import { z } from "zod";
import type { VectorParams } from "@/lib/domain/entities";

/** Cotas globales: espejo de app.config → VectorParamsSchema (única fuente). */
export const CommonVectorParamsSchema = z.strictObject({
  colorPrecision: z.number().int().min(1).max(8),
  filterSpeckle: z.number().int().min(1).max(64),
  cornerThreshold: z.number().int().min(0).max(180),
  lengthThreshold: z.number().min(1).max(100),
  mode: z.enum(["spline", "polygon"]),
  maxColors: z.number().int().min(1).max(64),
});

/** Metadatos para autogenerar el control del formulario (plan §4.4). */
export interface FieldMeta {
  key: keyof VectorParams | string;
  label: string;
  description?: string;
  kind: "number" | "enum" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
}

/** Metadatos de los 6 campos comunes: etiquetas en castellano del taller. */
export const COMMON_FIELD_METAS: FieldMeta[] = [
  {
    key: "colorPrecision",
    label: "Precisión de color",
    description: "Bits por canal: menos bits = tintas más contadas.",
    kind: "number",
    min: 1,
    max: 8,
    step: 1,
    unit: "bits",
  },
  {
    key: "filterSpeckle",
    label: "Filtro de motas",
    description: "Regiones menores a este área se funden con el vecino.",
    kind: "number",
    min: 1,
    max: 64,
    step: 1,
    unit: "px²",
  },
  {
    key: "cornerThreshold",
    label: "Umbral de esquina",
    description: "Ángulos menores se conservan vivos; mayores se suavizan.",
    kind: "number",
    min: 0,
    max: 180,
    step: 1,
    unit: "°",
  },
  {
    key: "lengthThreshold",
    label: "Longitud mínima",
    description: "Los segmentos más cortos se fusionan al simplificar.",
    kind: "number",
    min: 1,
    max: 100,
    step: 0.5,
    unit: "px",
  },
  {
    key: "mode",
    label: "Modo de trazo",
    description: "Spline (curvas Bézier) o polígono (aristas rectas).",
    kind: "enum",
    options: [
      { value: "spline", label: "Spline" },
      { value: "polygon", label: "Polígono" },
    ],
  },
  {
    key: "maxColors",
    label: "Máx. de tintas",
    description: "Límite de colores planos tras la cuantización.",
    kind: "number",
    min: 1,
    max: 64,
    step: 1,
    unit: "colores",
  },
];
