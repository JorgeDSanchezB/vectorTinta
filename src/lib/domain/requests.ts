/**
 * VectorTinta — Esquemas de petición compartidos (plan §3.1: Zod .strict() en el borde).
 *
 * Módulo ISOMORFO: el cliente pre-valida ANTES de llamar (feedback instantáneo,
 * plan §4.4) y el servidor re-valida en la ruta (autoridad). MISMO esquema =
 * cero divergencia de contratos.
 *
 * Reglas transversales del plan §4.2 aplicadas en http/validate.ts (servidor):
 * tamaño JSON ≤ limits.json.maxBytes, profundidad ≤ maxDepth, claves peligrosas
 * (`__proto__`, `prototype`, `constructor`) RECHAZADAS y guard anti-PII.
 */
import { z } from "zod";
import { appConfig } from "@/lib/config/app.config";
import { ColorHexSchema } from "@/lib/domain/entities";

const L = appConfig.limits;

/* ── Auth ── */

export const RegisterRequestSchema = z.strictObject({
  email: z.email({ message: "Email RFC no válido" }),
  password: z.string().min(1, "La política de contraseñas se valida en el servidor"),
  name: z.string().min(1).max(80).optional(),
});

export const LoginRequestSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1),
});

/* ── Proyectos ── */

export const CreateProjectRequestSchema = z.strictObject({
  name: z.string().min(1, "El nombre es obligatorio").max(L.projects.nameMaxLength),
  // null explícito = "sin valor" (se conserva; regla 4 del listón)
  description: z.string().min(1).max(280).nullable().optional(),
});

export const PatchProjectRequestSchema = z
  .strictObject({
    name: z.string().min(1).max(L.projects.nameMaxLength).optional(),
    description: z.string().min(1).max(280).nullable().optional(),
    /** Clave de almacenamiento de la miniatura (uso de servicios). */
    thumbnailKey: z.string().min(1).max(200).optional(),
    /** Id del Asset role='thumbnail' propio: el servidor resuelve su storageKey (uso de clientes web, ADR-012). */
    thumbnailAssetId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Al menos un campo" })
  .refine(
    (v) => !(v.thumbnailKey !== undefined && v.thumbnailAssetId !== undefined),
    { message: "thumbnailKey y thumbnailAssetId son excluyentes" },
  );

/* ── Vectorización (plan §3.3 + ADR-012: fragmentSvg explícito por capa) ── */

export const VectorizeLayerSchema = z.strictObject({
  orden: z.number().int().min(0).max(L.layers.maxPerVectorization - 1),
  colorHex: ColorHexSchema,
  name: z.string().min(1).max(80),
  areaPx: z.number().int().min(0),
  fragmentSvg: z.string().min(4),
});

export const VectorizeRequestSchema = z.strictObject({
  presetId: z.string().min(2).max(32),
  engineId: z.string().min(2).max(32),
  sourceAssetId: z.string().min(1),
  svg: z.string().min(4),
  layers: z.array(VectorizeLayerSchema).min(1).max(L.layers.maxPerVectorization),
});

/* ── Capas ── */

export const PatchLayerRequestSchema = z
  .strictObject({
    colorHex: ColorHexSchema.optional(),
    name: z.string().min(1).max(80).optional(),
    visible: z.boolean().optional(),
    orden: z.number().int().min(0).max(L.layers.maxPerVectorization - 1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Al menos un campo" });

/** Duplicar capa (POST /layers): clona el fragmento con nuevo color/nombre. */
export const CreateLayerRequestSchema = z.strictObject({
  sourceLayerId: z.string().min(1),
  colorHex: ColorHexSchema.optional(),
  name: z.string().min(1).max(80).optional(),
});

/* ── Exportaciones (ADR-012: registro multipart; el blob va en el campo `file`) ── */

export const ExportRegisterFieldsSchema = z.strictObject({
  formatId: z.string().min(2).max(32),
  /** JSON del manifest como texto (validado contra ExporterRegistry). */
  manifestJson: z.string().min(2),
  /** sha-256 hex del blob, declarado por el cliente y revalidado por el servidor (S-06). */
  checksum: z.string().regex(/^[0-9a-f]{64}$/, "sha-256 hex de 64 caracteres"),
});

export const CursorSchema = z.string().min(1).max(512).optional();

export const LimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(appConfig.pagination.maxLimit)
  .default(appConfig.pagination.defaultLimit);
