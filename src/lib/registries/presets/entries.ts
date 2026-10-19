/**
 * VectorTinta — Entradas de preset (ADR-008). id/label/description/version
 * DEBEN coincidir con la semilla de app.config → vectorization.presetManifest;
 * el PresetRegistry lo verifica al construirse (clase CONFIG si divergen).
 * Los VALORES POR DEFECTO viven en la semilla de configuración; aquí solo
 * el esquema (cotas) y los metadatos de formulario.
 */
import { CommonVectorParamsSchema, COMMON_FIELD_METAS, type FieldMeta } from "@/lib/registries/presets/common";
import type { RegistryEntry } from "@/lib/registries/registry";

export type PresetEntry = RegistryEntry<"baja" | "media" | "alta" | string, typeof CommonVectorParamsSchema> & {
  /** Metadatos de autogeneración del formulario del inspector (plan §4.4). */
  fields: FieldMeta[];
};

export const presetBaja: PresetEntry = {
  id: "baja",
  label: "Baja fidelidad",
  description: "Póster/serigrafía de tintas contadas: zonas grandes, pocos nodos.",
  schemaVersion: 1,
  schema: CommonVectorParamsSchema,
  fields: COMMON_FIELD_METAS,
  metadata: { enfoque: "tintas contadas" },
};

export const presetMedia: PresetEntry = {
  id: "media",
  label: "Media fidelidad",
  description: "Equilibrio por defecto para ilustración y arte de cliente.",
  schemaVersion: 1,
  schema: CommonVectorParamsSchema,
  fields: COMMON_FIELD_METAS,
  metadata: { enfoque: "equilibrio" },
};

export const presetAlta: PresetEntry = {
  id: "alta",
  label: "Alta fidelidad",
  description: "Máximo detalle antes del límite de capas; más nodos y peso.",
  schemaVersion: 1,
  schema: CommonVectorParamsSchema,
  fields: COMMON_FIELD_METAS,
  metadata: { enfoque: "máximo detalle" },
};
