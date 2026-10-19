/**
 * VectorTinta — OperationRegistry (ADR-008, plan §4.1).
 *
 * Operaciones de imagen ejecutables en el CLIENTE (ADR-001/ADR-003):
 * eliminación de fondo hoy; esqueletonizado, nitidez de bordes, etc.
 * mañana = nuevas entradas. El esquema de OPCIONES de cada operación
 * autogenera su panel de control (igual que los presets del inspector).
 *
 * Licencias: 'pending-audit' = el plan exige auditoría antes de producción;
 * el bloqueo se DECLARA en metadata (ADR de licencias del plan); ningún texto
 * de la app afirma "licencia verificada" (verificado por el árbitro).
 */
import { z } from "zod";
import { Registry } from "@/lib/registries/registry";
import type { FieldMeta } from "@/lib/registries/presets/common";

/** Opciones del motor chroma-edge (implementado en src/lib/bg-removal/engines/chroma-edge.ts). */
export const ChromaEdgeOptionsSchema = z.strictObject({
  tolerance: z.number().min(0).max(100),
  feather: z.boolean(),
});

/** Opciones del motor u2net-onnx (ADR-009; bloqueado por CONFIG si falta la URL del modelo). */
export const U2netOnnxOptionsSchema = z.strictObject({
  tolerance: z.number().min(0).max(100),
  feather: z.boolean(),
});

export interface OperationEntry {
  id: "bg-chroma-edge" | "bg-u2net-onnx" | string;
  label: string;
  description: string;
  schemaVersion: number;
  schema: z.ZodType;
  /** Id del motor cliente que ejecuta la operación (registro de engines del pipeline). */
  engineId: string;
  fields: FieldMeta[];
  metadata?: Record<string, string>;
}

const OPERATION_ENTRIES: OperationEntry[] = [
  {
    id: "bg-chroma-edge",
    label: "Fondo por croma de borde",
    description:
      "Relleno por similitud de color desde los bordes de la imagen (taller de estampación: fondos planos). Reversible: la máscara alfa es un comando del historial.",
    schemaVersion: 1,
    schema: ChromaEdgeOptionsSchema,
    engineId: "chroma-edge",
    fields: [
      { key: "tolerance", label: "Tolerancia", kind: "number", min: 0, max: 100, step: 1, unit: "%" },
      { key: "feather", label: "Suavizar borde", kind: "boolean" },
    ],
    metadata: { licencia: "audited-ok", origen: "implementación propia" },
  },
  {
    id: "bg-u2net-onnx",
    label: "Fondo por red neuronal (U²-Net)",
    description:
      "Segmentación saliente con modelo ONNX en el Worker (ADR-009). Requiere NEXT_PUBLIC_BG_REMOVAL_MODEL_URL; si no está definida, la operación se bloquea con la clase CONFIG y un banner con el nombre exacto de la variable.",
    schemaVersion: 1,
    schema: U2netOnnxOptionsSchema,
    engineId: "u2net-onnx",
    fields: [
      { key: "tolerance", label: "Umbral de recorte alfa", kind: "number", min: 0, max: 100, step: 1, unit: "%" },
      { key: "feather", label: "Suavizar borde", kind: "boolean" },
    ],
    metadata: { licencia: "pending-audit", bloqueo: "CONFIG si falta NEXT_PUBLIC_BG_REMOVAL_MODEL_URL" },
  },
];

export const operationRegistry = new Registry<string, z.ZodType>(OPERATION_ENTRIES);

/** Consulta TIPADA para la UI (el Registry conserva el contrato de validación). */
export function getOperation(id: string): OperationEntry | undefined {
  return OPERATION_ENTRIES.find((op) => op.id === id);
}

/** Listado tipado para los paneles (orden del registro). */
export function listOperations(): OperationEntry[] {
  return OPERATION_ENTRIES;
}
