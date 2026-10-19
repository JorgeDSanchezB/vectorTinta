/**
 * VectorTinta — /api/projects/:id/assets (plan §3.3 multipart, supuesto S-06).
 *
 * POST (multipart/form-data): campos `file` (binario) + `role`, `width`,
 * `height`, `checksum` DECLARADOS por el cliente y REVALIDADOS por el
 * servidor en este orden exacto:
 *   ① Content-Length > limits.image.maxUploadBytes → 413 SIN leer el cuerpo.
 *   ② formData() + validación de campos declarados.
 *   ③ tamaño real tras leer el buffer (413 / 400 si 0 bytes).
 *   ④ MIME ∈ allowlist de config.
 *   ⑤ sharp revalida dimensiones REALES vs declaradas y ≤ maxDimension
 *      (divergencia → 400 con el campo exacto: width/height).
 *   ⑥ sha-256 real vs declarado → 400 mismatch.
 *   ⑦ cuota maxAssetsPerProject → 409 cuota-assets.
 *   ⑧ almacenamiento + fila Asset → 201 AssetDto con downloadUrl firmada.
 *
 * GET: paginación por cursor compuesto como TODOS los listados (ADR-010).
 */
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { appConfig } from "@/lib/config/app.config";
import { CursorSchema, LimitSchema } from "@/lib/domain/requests";
import type { AssetDto, Paginated } from "@/lib/domain/entities";
import { ApiProblem } from "@/lib/domain/errors";
import { withApi } from "@/lib/http/api-handler";
import { CURSOR_ORDER, cursorWhere, decodeCursor, encodeCursor } from "@/lib/http/cursor";
import { ASSET_SELECT, assetDto, requireOwnedProject } from "@/lib/http/dto";
import { requestPath, throwProblem, zodProblemObject } from "@/lib/http/problem";
import { writeAudit } from "@/lib/audit";
import { STORAGE_KEYS } from "@/lib/storage/adapter";
import { localStorage } from "@/lib/storage/local";
import { db } from "@/lib/db";

const IMAGE_LIMITS = appConfig.limits.image;

/** Metadatos declarados en el multipart (S-06: revalidados por el servidor). */
const UploadFieldsSchema = z.strictObject({
  role: z.enum(["source", "result", "thumbnail"]),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  checksum: z.string().regex(/^[0-9a-f]{64}$/, "sha-256 hex de 64 caracteres"),
});

function mimeExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

/** Clave de almacenamiento por rol (convención fija de adapter.ts). */
function assetKey(projectId: string, assetId: string, role: string, ext: string): string {
  switch (role) {
    case "thumbnail":
      return STORAGE_KEYS.thumbnail(projectId, assetId, ext);
    case "result":
      return STORAGE_KEYS.result(projectId, assetId, ext);
    default:
      return STORAGE_KEYS.source(projectId, assetId, ext);
  }
}

/* ───────────────────── POST /api/projects/:id/assets ───────────────────── */

export const POST = withApi<{ id: string }>({ auth: true, rate: "mutations" }, async (req, ctx) => {
  const projectId = ctx.params.id;
  const instance = `/api/projects/${projectId}/assets`;
  await requireOwnedProject(ctx.userId as string, projectId, instance);

  // ① Content-Length ANTES de leer (413 temprano, plan §3.3 canónico).
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number.parseInt(declared, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > IMAGE_LIMITS.maxUploadBytes) {
      const mib = Math.round(IMAGE_LIMITS.maxUploadBytes / (1024 * 1024));
      throwProblem("payload-grande", {
        title: "Imagen demasiado grande",
        detail: `El archivo supera ${mib} MiB.`,
        instance,
        errors: [{ code: "max_upload_bytes", limitBytes: IMAGE_LIMITS.maxUploadBytes }],
      });
    }
  }

  // ② formData + campos declarados.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "Se esperaba multipart/form-data con el campo file.",
      instance,
      errors: [{ field: "file", code: "invalid_type" }],
    });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "Falta el campo file con el binario de la imagen.",
      instance,
      errors: [{ field: "file", code: "invalid_type", expected: "file" }],
    });
  }

  const fieldsParsed = UploadFieldsSchema.safeParse({
    role: form.get("role"),
    width: form.get("width"),
    height: form.get("height"),
    checksum: form.get("checksum"),
  });
  if (!fieldsParsed.success) {
    throw new ApiProblem(zodProblemObject(fieldsParsed.error, instance));
  }
  const fields = fieldsParsed.data;

  // ③ Tamaño real tras leer (el multipart puede traer más de lo declarado).
  if (file.size > IMAGE_LIMITS.maxUploadBytes) {
    const mib = Math.round(IMAGE_LIMITS.maxUploadBytes / (1024 * 1024));
    throwProblem("payload-grande", {
      title: "Imagen demasiado grande",
      detail: `El archivo supera ${mib} MiB.`,
      instance,
      errors: [{ code: "max_upload_bytes", limitBytes: IMAGE_LIMITS.maxUploadBytes }],
    });
  }
  if (file.size === 0) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "El archivo está vacío.",
      instance,
      errors: [{ field: "file", code: "too_small", minLength: 1 }],
    });
  }

  // ④ MIME ∈ allowlist (config).
  if (!IMAGE_LIMITS.allowedMimeTypes.includes(file.type as (typeof IMAGE_LIMITS.allowedMimeTypes)[number])) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "El MIME de la imagen no está permitido.",
      instance,
      errors: [{ field: "file", code: "invalid_mime", allowed: [...IMAGE_LIMITS.allowedMimeTypes] }],
    });
  }

  // ⑤ sharp: dimensiones REALES vs declaradas + límite por lado.
  const buffer = Buffer.from(await file.arrayBuffer());
  let realWidth: number;
  let realHeight: number;
  try {
    const metadata = await sharp(buffer).metadata();
    realWidth = metadata.width ?? 0;
    realHeight = metadata.height ?? 0;
  } catch {
    // Binario no decodificable (p. ej. texto con cabecera de imagen falsa).
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "El archivo no es una imagen decodificable.",
      instance,
      errors: [{ field: "file", code: "not_an_image" }],
    });
  }
  if (realWidth !== fields.width) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "El width declarado no coincide con la imagen real.",
      instance,
      errors: [{ field: "width", code: "mismatch", declared: fields.width, real: realWidth }],
    });
  }
  if (realHeight !== fields.height) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "El height declarado no coincide con la imagen real.",
      instance,
      errors: [{ field: "height", code: "mismatch", declared: fields.height, real: realHeight }],
    });
  }
  if (realWidth > IMAGE_LIMITS.maxDimension || realHeight > IMAGE_LIMITS.maxDimension) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: `Las dimensiones superan el máximo de ${IMAGE_LIMITS.maxDimension}px por lado.`,
      instance,
      errors: [{ field: "file", code: "too_big", max: IMAGE_LIMITS.maxDimension }],
    });
  }

  // ⑥ Checksum sha-256 real vs declarado (S-06: integridad de extremo a extremo).
  const realChecksum = createHash("sha256").update(buffer).digest("hex");
  if (realChecksum !== fields.checksum) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "El checksum declarado no coincide con el archivo recibido.",
      instance,
      errors: [{ field: "checksum", code: "mismatch" }],
    });
  }

  // ⑦ Cuota de assets por proyecto (config) → 409 cuota-assets.
  const limit = appConfig.limits.projects.maxAssetsPerProject;
  const count = await db.asset.count({ where: { projectId } });
  if (count >= limit) {
    throwProblem("cuota-assets", {
      title: "Cuota de archivos excedida",
      detail: `Este proyecto ya tiene ${limit} archivos.`,
      instance,
      errors: [{ resource: "assets", code: "quota_exceeded", limit }],
    });
  }

  // ⑧ Almacenar + fila Asset con id explícito (la clave depende del id).
  const assetId = randomUUID();
  const key = assetKey(projectId, assetId, fields.role, mimeExt(file.type));
  await localStorage.putBuffer(key, buffer);

  const asset = await db.asset.create({
    data: {
      id: assetId,
      projectId,
      role: fields.role,
      mimeType: file.type,
      width: realWidth,
      height: realHeight,
      bytes: buffer.byteLength,
      storageKey: key,
      checksum: realChecksum,
    },
    select: ASSET_SELECT,
  });

  await writeAudit({
    userId: ctx.userId,
    projectId,
    action: "asset.upload",
    metadata: { role: fields.role, bytes: buffer.byteLength }, // solo roles/contadores.
  });

  return NextResponse.json({ asset: await assetDto(asset) }, { status: 201 });
});

/* ─────────────── GET /api/projects/:id/assets?limit=&cursor= ─────────────── */

export const GET = withApi<{ id: string }>({ auth: true, rate: "general" }, async (req, ctx) => {
  const projectId = ctx.params.id;
  const instance = requestPath(req.url);
  await requireOwnedProject(ctx.userId as string, projectId, instance);

  const search = req.nextUrl.searchParams;
  const limitParsed = LimitSchema.safeParse(search.get("limit") === null || search.get("limit") === "" ? undefined : search.get("limit"));
  if (!limitParsed.success) throw new ApiProblem(zodProblemObject(limitParsed.error, instance));
  const cursorParsed = CursorSchema.safeParse(search.get("cursor") === null || search.get("cursor") === "" ? undefined : search.get("cursor"));
  if (!cursorParsed.success) throw new ApiProblem(zodProblemObject(cursorParsed.error, instance));
  const cursor = cursorParsed.data !== undefined ? decodeCursor(cursorParsed.data) : undefined;

  const rows = await db.asset.findMany({
    where: { projectId, ...(cursorWhere(cursor) ?? {}) },
    orderBy: CURSOR_ORDER,
    take: limitParsed.data + 1,
    select: ASSET_SELECT,
  });

  const page = rows.slice(0, limitParsed.data);
  const hasMore = rows.length > limitParsed.data;
  const last = page[page.length - 1];
  const body: Paginated<AssetDto> = {
    items: await Promise.all(page.map(assetDto)),
    nextCursor: hasMore && last !== undefined ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    hasMore,
  };
  return NextResponse.json(body);
});
