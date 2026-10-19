/**
 * VectorTinta — Configuración central de la aplicación (ARTEFACTO REAL de Fase 6).
 *
 * Rol en el plan:
 *  - Es la única fuente de los valores de negocio (regla 1 del listón: CERO HARCODING).
 *  - Se valida íntegramente con Zod en tiempo de arranque: si un valor está mal,
 *    la app NO arranca con configuración rota (clase CONFIG de failure-modes.md).
 *  - El visor de la especificación (ruta "/") importa ESTE archivo y renderiza sus
 *    valores reales: lo que se ve en pantalla proviene de aquí, no de copias.
 *
 * Frontera cliente/servidor:
 *  - Este archivo es SEGURO para el cliente (no hay secretos).
 *  - Los valores dependientes de entorno (TTL de tokens, rate limits, DATABASE_URL…)
 *    viven en `server.config.ts` (Fase 6), jamás aquí.
 *  - Digest en TS puro (FNV-1a 32 bits, dependencia cero): computable en navegador
 *    y servidor; NO se usan APIs nativas (Bun/WebCrypto) por ser módulo cliente.
 *
 * NOTA de versión: configSchemaVersion permite migrar la forma de este objeto
 * con el mismo MigrationRegistry que usa el resto de JSONs versionados (Fase 4).
 */
import { z } from "zod";

/* ─────────────────────────── Esquemas ─────────────────────────── */

/** HEX de color plano, 6 dígitos. Invariante compartida con `Layer.colorHex`. */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color plano esperado como #RRGGBB");

/** Entrada de la paleta serigráfica con nombre (tinta plastisol). */
const InkColorSchema = z.object({
  hex: HexColorSchema,
  name: z.string().min(1).max(48),
  /** Nota de uso del taller (opcional; nunca se deduce del HEX). */
  note: z.string().max(120).optional(),
});

/** Límites de la imagen de entrada (motivo de cada límite documentado en el plan §1.3). */
const LimitsImageSchema = z.object({
  allowedMimeTypes: z.array(z.enum(["image/jpeg", "image/png", "image/webp"])).min(1),
  maxUploadBytes: z.number().int().positive(),
  maxDimension: z.number().int().positive(),
  maxPixels: z.number().int().positive(),
});

/** Límites del dominio de capas e historial. */
const LimitsLayersSchema = z.object({
  maxPerVectorization: z.number().int().positive(),
  historyStackSize: z.number().int().positive(),
});

/** Cuotas de proyecto (plan gratuito). */
const LimitsProjectsSchema = z.object({
  maxPerUserFree: z.number().int().positive(),
  nameMaxLength: z.number().int().positive(),
  maxAssetsPerProject: z.number().int().positive(),
});

/** Cuotas de exportación. */
const LimitsExportsSchema = z.object({
  maxPerDay: z.number().int().positive(),
});

/** Límites de los JSON variables (params/manifest/metadata) — Fase 4. */
const LimitsJsonSchema = z.object({
  maxBytes: z.number().int().positive(),
  maxDepth: z.number().int().positive(),
});

/** Paginación por cursor (ADR-010): valores por defecto y tope por endpoint. */
const PaginationSchema = z.object({
  defaultLimit: z.number().int().positive(),
  maxLimit: z.number().int().positive(),
});

/** Renderizado: umbral de virtualización y color de rescate para datos inválidos. */
const RenderingSchema = z.object({
  virtualizationThreshold: z.number().int().positive(),
  /** Color imposible de confundir con arte real: denuncia el problema en el lienzo. */
  fallbackColorHex: HexColorSchema,
});

/** Reglas de degradación en pantallas pequeñas (supuesto S-03 del plan). */
const MobileSchema = z.object({
  blockHeavyOpsBelowViewportPx: z.number().int().positive(),
});

/** Motor de eliminación de fondo (ADR-009): la URL del modelo es configuración. */
const BgRemovalSchema = z.object({
  /** Nombre de la variable de entorno que el engine lee en el cliente. */
  modelUrlEnvName: z.string().min(3),
  /** Umbral de descarga que exige consentimiento visible del usuario. */
  consentNoticeMinBytes: z.number().int().positive(),
});

/** Parámetros por preset. Los rangos son datos: el esquema Zod de cada preset
 *  (Fase 6, src/lib/registries/presets/*.ts) se construye desde estas cotas,
 *  y un preset nuevo puede AÑADIR campos propios (p. ej. 'comic' → strokeWidth). */
const VectorParamsSchema = z.object({
  colorPrecision: z.number().int().min(1).max(8),
  filterSpeckle: z.number().int().min(1).max(64),
  cornerThreshold: z.number().int().min(0).max(180),
  lengthThreshold: z.number().min(1).max(100),
  mode: z.enum(["spline", "polygon"]),
  maxColors: z.number().int().min(1).max(64),
});

/** Manifiesto de presets: el PresetRegistry se construye desde aquí (ADR-008).
 *  Añadir el preset "cómic" = añadir una entrada aquí + su esquema en Fase 6. */
const PresetSeedSchema = z.object({
  id: z.string().min(2).max(32),
  label: z.string().min(1).max(48),
  description: z.string().min(1).max(200),
  schemaVersion: z.number().int().positive(),
  params: VectorParamsSchema,
});

/** Manifiesto de formatos de exportación: el ExporterRegistry se construye desde aquí. */
const ExportFormatSeedSchema = z.object({
  id: z.string().min(2).max(32),
  label: z.string().min(1).max(48),
  description: z.string().min(1).max(200),
  manifestSchemaVersion: z.number().int().positive(),
});

/** Exportación serigráfica: plantillas de nombres (nada de nombres hardcodeados). */
const ExportSchema = z.object({
  formats: z.array(ExportFormatSeedSchema).min(1),
  /** Plantilla del archivo de capa: soporta {orden:02d} (relleno a 2 dígitos), {colorHex}, {layerId}. */
  filePattern: z.string().min(3).max(120),
  /** Marca de tinta única por capa (listón: “marca de tinta única”): {orden:02d}, {colorHex}. */
  inkMarkPattern: z.string().min(3).max(120),
  manifestFileName: z.string().min(1).max(64),
  printOrderStrategy: z.enum(["by-area-desc", "by-lightness"]),
});

export const AppConfigSchema = z.object({
  configSchemaVersion: z.number().int().positive(),
  product: z.object({
    name: z.string().min(1).max(64),
    tagline: z.string().min(1).max(160),
  }),
  limits: z.object({
    image: LimitsImageSchema,
    layers: LimitsLayersSchema,
    projects: LimitsProjectsSchema,
    exports: LimitsExportsSchema,
    json: LimitsJsonSchema,
  }),
  pagination: PaginationSchema,
  rendering: RenderingSchema,
  mobile: MobileSchema,
  bgRemoval: BgRemovalSchema,
  colors: z.object({
    /** Paleta de tintas sugeridas: DATO de dominio (nombre + HEX), no tema de UI. */
    inkPalette: z.array(InkColorSchema).min(1),
  }),
  vectorization: z.object({
    presetManifest: z.array(PresetSeedSchema).min(1),
  }),
  export: ExportSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type PresetSeed = z.infer<typeof PresetSeedSchema>;

/* ──────────────────────── Valores y validación ──────────────────────── */

export const appConfig: AppConfig = AppConfigSchema.parse({
  configSchemaVersion: 1,

  product: {
    name: "VectorTinta",
    tagline: "Estudio web de vectorización y preparación de tintas para serigrafía",
  },

  limits: {
    image: {
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxUploadBytes: 15_728_640, // 15 MiB — supuesto S-01 del plan
      maxDimension: 4096,
      maxPixels: 4096 * 4096,
    },
    layers: {
      maxPerVectorization: 30, // encima: merge forzoso por cercanía de color
      historyStackSize: 100, // undo/redo acotado
    },
    projects: {
      maxPerUserFree: 20, // cuota del plan gratuito → 409 RFC 7807 al superarla
      nameMaxLength: 80,
      maxAssetsPerProject: 12,
    },
    exports: {
      maxPerDay: 50,
    },
    json: {
      maxBytes: 8_192, // params/manifest/metadata
      maxDepth: 4,
    },
  },

  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },

  rendering: {
    virtualizationThreshold: 50, // react-window por encima de 50 nodos
    fallbackColorHex: "#FF00FF", // “magenta de rescate”: error visible, no silencioso
  },

  mobile: {
    blockHeavyOpsBelowViewportPx: 900, // debajo: solo consulta + export ligera (S-03)
  },

  bgRemoval: {
    modelUrlEnvName: "NEXT_PUBLIC_BG_REMOVAL_MODEL_URL", // ausencia ⇒ clase CONFIG con banner
    consentNoticeMinBytes: 10_485_760, // 10 MiB: pedir consentimiento antes de descargar
  },

  colors: {
    inkPalette: [
      { hex: "#1B1B1B", name: "Negro intenso", note: "Máxima opacidad sobre algodón" },
      { hex: "#F2EFE6", name: "Blanco hueso", note: "Base / blanco de cobertura" },
      { hex: "#BF1932", name: "Rojo cooper", note: "Cobertura de alto contraste" },
      { hex: "#D9480C", name: "Naranja tinta" },
      { hex: "#E9B824", name: "Mostaza taller" },
      { hex: "#4A6741", name: "Verde serpiente" },
      { hex: "#0F4C3A", name: "Verde pantano" },
      { hex: "#1F3A5F", name: "Azul marino profundo" },
      { hex: "#6C8EBF", name: "Azul niebla claro" },
      { hex: "#7C3AED", name: "Violeta pantone" },
      { hex: "#8C4A2F", name: "Marrón cuero" },
      { hex: "#C0B7A8", name: "Arena mate" },
    ],
  },

  vectorization: {
    presetManifest: [
      {
        id: "baja",
        label: "Baja fidelidad",
        description: "Póster/serigrafía de tintas contadas: zonas grandes, pocos nodos.",
        schemaVersion: 1,
        params: {
          colorPrecision: 3,
          filterSpeckle: 8,
          cornerThreshold: 90,
          lengthThreshold: 8,
          mode: "spline",
          maxColors: 8,
        },
      },
      {
        id: "media",
        label: "Media fidelidad",
        description: "Equilibrio por defecto para ilustración y arte de cliente.",
        schemaVersion: 1,
        params: {
          colorPrecision: 4,
          filterSpeckle: 4,
          cornerThreshold: 60,
          lengthThreshold: 4,
          mode: "spline",
          maxColors: 16,
        },
      },
      {
        id: "alta",
        label: "Alta fidelidad",
        description: "Máximo detalle antes del límite de capas; más nodos y peso.",
        schemaVersion: 1,
        params: {
          colorPrecision: 6,
          filterSpeckle: 2,
          cornerThreshold: 30,
          lengthThreshold: 3.5,
          mode: "spline",
          maxColors: 32,
        },
      },
    ],
  },

  export: {
    formats: [
      {
        id: "zip-serigrafia",
        label: "ZIP serigráfico",
        description: "Un SVG por capa + manifest.json con orden de impresión.",
        manifestSchemaVersion: 1,
      },
      {
        id: "png-mockup",
        label: "Mockup PNG",
        description: "Composición plana para aprobar el arte con el cliente.",
        manifestSchemaVersion: 1,
      },
    ],
    filePattern: "capa-{orden:02d}-{colorHex}-{layerId}.svg", // nombres estables; {orden:02d} = relleno a 2 dígitos
    inkMarkPattern: "TINTA-{orden:02d}-{colorHex}",
    manifestFileName: "manifest.json",
    printOrderStrategy: "by-area-desc",
  },
});

/** FNV-1a 32 bits sobre el JSON canónico de la configuración. Dependencia cero. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Digest corto de configuración (para GET /api/health: detecta drift entre entornos). */
export const configDigest = `fnv1a-${fnv1a(JSON.stringify(appConfig))}`;
