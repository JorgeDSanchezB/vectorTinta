/**
 * VectorTinta — ExporterRegistry (ADR-008, plan §4.1).
 *
 * Se construye desde app.config → export.formats unido a los esquemas de
 * manifest de formats/manifests.ts. Añadir "pdf-capas" = (1) esquema de su
 * manifest aquí y (2) semilla en app.config → export.formats. Nada más.
 */
import { appConfig } from "@/lib/config/app.config";
import { Registry, type RegistryEntry } from "@/lib/registries/registry";
import { PngMockupManifestSchema, ZipSerigrafiaManifestSchema } from "@/lib/registries/formats/manifests";

type AnyManifestSchema = typeof ZipSerigrafiaManifestSchema | typeof PngMockupManifestSchema;

const KNOWN_FORMATS: Record<string, { schema: AnyManifestSchema }> = {
  "zip-serigrafia": { schema: ZipSerigrafiaManifestSchema },
  "png-mockup": { schema: PngMockupManifestSchema },
};

function buildExporterRegistry(): Registry<string, AnyManifestSchema> {
  const entries: RegistryEntry<string, AnyManifestSchema>[] = [];
  for (const seed of appConfig.export.formats) {
    const known = KNOWN_FORMATS[seed.id];
    if (!known) {
      throw new Error(`ExporterRegistry: el formato sembrado "${seed.id}" no tiene esquema registrado`);
    }
    if (seed.manifestSchemaVersion !== 1) {
      throw new Error(`ExporterRegistry: versión de manifest no soportada en "${seed.id}"`);
    }
    entries.push({
      id: seed.id,
      label: seed.label,
      description: seed.description,
      schemaVersion: seed.manifestSchemaVersion,
      schema: known.schema,
    });
  }
  return new Registry(entries);
}

export const exporterRegistry = buildExporterRegistry();
