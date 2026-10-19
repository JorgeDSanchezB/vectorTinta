/**
 * VectorTinta — PresetRegistry (ADR-008, plan §4.1).
 *
 * Se CONSTRUYE desde el manifiesto de app.config (vectorization.presetManifest)
 * unido a las entradas de presets/entries.ts. Añadir el preset "cómic" =
 * (1) una entrada aquí con su esquema extendido y (2) una semilla en
 * app.config. Cero cambios en el validador central, el inspector o el Worker.
 */
import { appConfig } from "@/lib/config/app.config";
import { Registry, type RegistryEntry } from "@/lib/registries/registry";
import { presetAlta, presetBaja, presetMedia, type PresetEntry } from "@/lib/registries/presets/entries";
import { COMMON_FIELD_METAS, CommonVectorParamsSchema, type FieldMeta } from "@/lib/registries/presets/common";
import type { VectorParams } from "@/lib/domain/entities";

/** Todas las entradas conocidas; el registro solo acepta las sembradas en config. */
const KNOWN_PRESETS: Record<string, PresetEntry> = {
  baja: presetBaja,
  media: presetMedia,
  alta: presetAlta,
};

function buildPresetRegistry(): Registry<string, typeof CommonVectorParamsSchema> {
  const seeds = appConfig.vectorization.presetManifest;
  const entries: RegistryEntry<string, typeof CommonVectorParamsSchema>[] = [];
  for (const seed of seeds) {
    const known = KNOWN_PRESETS[seed.id];
    if (!known) {
      // CONFIG: la semilla declara un preset cuya entrada de esquema aún no existe.
      throw new Error(`PresetRegistry: la semilla "${seed.id}" no tiene entrada registrada`);
    }
    if (known.schemaVersion !== seed.schemaVersion) {
      throw new Error(
        `PresetRegistry: versión divergente en "${seed.id}" (entrada ${known.schemaVersion}, semilla ${seed.schemaVersion})`,
      );
    }
    if (known.label !== seed.label || known.description !== seed.description) {
      throw new Error(`PresetRegistry: label/description divergentes en "${seed.id}"`);
    }
    // La semilla también debe validar contra el esquema de la entrada (defaults sanos).
    const parsed = known.schema.safeParse(seed.params);
    if (!parsed.success) {
      throw new Error(`PresetRegistry: params por defecto inválidos en "${seed.id}": ${parsed.error.message}`);
    }
    entries.push({
      id: known.id,
      label: known.label,
      description: known.description,
      schemaVersion: known.schemaVersion,
      schema: known.schema,
      metadata: known.metadata,
    });
  }
  return new Registry(entries);
}

export const presetRegistry = buildPresetRegistry();

/** Defaults del preset = semilla de configuración (única fuente de valores).
 * Id desconocido → semilla del primer preset del manifiesto (el esquema exige ≥1). */
export function presetDefaults(presetId: string): VectorParams {
  const seed =
    appConfig.vectorization.presetManifest.find((p) => p.id === presetId) ?? appConfig.vectorization.presetManifest[0];
  return { ...seed.params };
}

/** Metadatos de formulario del preset (FIELDS); campo desconocido → base común. */
export function presetFields(presetId: string): FieldMeta[] {
  const known = KNOWN_PRESETS[presetId];
  return known ? known.fields : COMMON_FIELD_METAS;
}
