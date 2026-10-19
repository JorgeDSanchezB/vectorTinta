/**
 * VectorTinta — /api/projects/:id/exports (ADR-012: registro multipart).
 *
 * POST (multipart/form-data): `file` (blob ZIP/PNG ensamblado por el Worker del
 * cliente) + `formatId` + `manifestJson` + `checksum` (campos de
 * ExportRegisterFieldsSchema). Orden:
 *   ① formatId ∈ ExporterRegistry → si no: 400 params-invalidos con
 *      supportedFormats (recurso enumerable).
 *   ② manifestJson: guardJson COMPLETO (§4.2: bytes/profundidad/claves/PII) +
 *      safeParse contra exporterRegistry.get(formatId).schema (la versión del
 *      manifest = schemaVersion del formato) → 400 con detalle por campo.
 *   ③ sha-256 real del blob vs declarado → 400 mismatch (S-06).
 *   ④ cuota maxPerDay (exports del proyecto en 24 h) → 409 cuota-exports.
 *   ⑤ almacenamiento del blob + fila Export → 201 {export: ExportDto}.
 *   ⑥ auditoría + métrica exportsByFormat[formatId].
 *
 * GET: paginación por cursor compuesto (ADR-010) de ExportDto.
 */
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appConfig } from "@/lib/config/app.config";
import { CursorSchema, ExportRegisterFieldsSchema, LimitSchema } from "@/lib/domain/requests";
import type { ExportDto, Paginated } from "@/lib/domain/entities";
import { ApiProblem } from "@/lib/domain/errors";
import { withApi } from "@/lib/http/api-handler";
import { CURSOR_ORDER, cursorWhere, decodeCursor, encodeCursor } from "@/lib/http/cursor";
import { EXPORT_SELECT, exportDto, requireOwnedProject } from "@/lib/http/dto";
import { requestPath, throwProblem, zodProblemObject } from "@/lib/http/problem";
import { guardJson } from "@/lib/http/validate";
import type { PngMockupManifest, ZipSerigrafiaManifest } from "@/lib/registries/formats/manifests";
import { exporterRegistry } from "@/lib/registries/exporter-registry";
import { recordExport } from "@/lib/metrics";
import { writeAudit } from "@/lib/audit";
import { STORAGE_KEYS } from "@/lib/storage/adapter";
import { localStorage } from "@/lib/storage/local";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const IMAGE_LIMITS = appConfig.limits.image;

/** Clave física del blob según el formato (convención fija de adapter.ts). */
function exportKey(projectId: string, exportId: string, formatId: string): string {
  return formatId === "png-mockup"
    ? STORAGE_KEYS.exportMockup(projectId, exportId)
    : STORAGE_KEYS.exportZip(projectId, exportId);
}

/* ────────────────────── POST /api/projects/:id/exports ────────────────────── */

export const POST = withApi<{ id: string }>({ auth: true, rate: "mutations" }, async (req, ctx) => {
  const projectId = ctx.params.id;
  const instance = `/api/projects/${projectId}/exports`;
  await requireOwnedProject(ctx.userId as string, projectId, instance);

  // Tope de subida: ANTES de leer (mismo contrato que assets, plan §3.1).
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number.parseInt(declared, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > IMAGE_LIMITS.maxUploadBytes) {
      throwProblem("payload-grande", {
        title: "Payload demasiado grande",
        detail: `El cuerpo de la petición supera ${IMAGE_LIMITS.maxUploadBytes} bytes.`,
        instance,
        errors: [{ code: "max_upload_bytes", limitBytes: IMAGE_LIMITS.maxUploadBytes }],
      });
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "Se esperaba multipart/form-data con el campo file.",
      instance,
      errors: [{ field: "file", code: "invalid_type", expected: "file" }],
    });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "Falta el campo file con el blob de la exportación.",
      instance,
      errors: [{ field: "file", code: "invalid_type", expected: "file" }],
    });
  }

  const fieldsParsed = ExportRegisterFieldsSchema.safeParse({
    formatId: form.get("formatId"),
    manifestJson: form.get("manifestJson"),
    checksum: form.get("checksum"),
  });
  if (!fieldsParsed.success) {
    throw new ApiProblem(zodProblemObject(fieldsParsed.error, instance));
  }
  const fields = fieldsParsed.data;

  // ① Formato registrado (recurso enumerable, plan §4.3).
  const format = exporterRegistry.get(fields.formatId);
  if (format === undefined) {
    throwProblem("params-invalidos", {
      title: "Formato no válido",
      detail: `El formato "${fields.formatId}" no está registrado.`,
      instance,
      errors: [{ field: "formatId", code: "unsupported_format" }],
      supportedFormats: exporterRegistry.ids(),
    });
  }

  // ② Manifest: guard §4.2 completo + safeParse contra el esquema del formato.
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(fields.manifestJson) as unknown;
  } catch {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "manifestJson no es JSON bienformado.",
      instance,
      errors: [{ field: "manifestJson", code: "invalid_json" }],
    });
  }
  // El registro expone una UNIÓN de esquemas por formato; el guard valida
  // contra el esquema del FORMATO PEDIDO (el cast solo afina el tipo union).
  const manifestSchema = format.schema as unknown as z.ZodType<ZipSerigrafiaManifest | PngMockupManifest>;
  const manifest = guardJson<ZipSerigrafiaManifest | PngMockupManifest>(manifestRaw, {
    schema: manifestSchema,
    fieldPrefix: "manifest",
    instance,
  }) as unknown as Prisma.InputJsonValue;

  // ③ Integridad del blob: sha-256 real vs declarado.
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > IMAGE_LIMITS.maxUploadBytes) {
    const mib = Math.round(IMAGE_LIMITS.maxUploadBytes / (1024 * 1024));
    throwProblem("payload-grande", {
      title: "Payload demasiado grande",
      detail: `El blob de exportación debe tener entre 1 byte y ${mib} MiB.`,
      instance,
      errors: [{ code: "max_upload_bytes", limitBytes: IMAGE_LIMITS.maxUploadBytes }],
    });
  }
  const realChecksum = createHash("sha256").update(buffer).digest("hex");
  if (realChecksum !== fields.checksum) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "El checksum declarado no coincide con el blob recibido.",
      instance,
      errors: [{ field: "checksum", code: "mismatch" }],
    });
  }

  // ④ Cuota diaria de exportaciones del proyecto (config) → 409.
  const limit = appConfig.limits.exports.maxPerDay;
  const since = new Date(Date.now() - 86_400_000);
  const count = await db.export.count({ where: { projectId, createdAt: { gte: since } } });
  if (count >= limit) {
    throwProblem("cuota-exports", {
      title: "Cuota de exportaciones excedida",
      detail: `Este proyecto ya registró ${limit} exportaciones en las últimas 24 horas.`,
      instance,
      errors: [{ resource: "exports", code: "quota_exceeded", limit }],
    });
  }

  // ⑤ Almacenar blob + fila Export (id explícito: la clave depende de él).
  const exportId = randomUUID();
  const key = exportKey(projectId, exportId, fields.formatId);
  await localStorage.putBuffer(key, buffer);

  let created;
  try {
    created = await db.export.create({
      data: {
        id: exportId,
        projectId,
        formatId: fields.formatId,
        storageKey: key,
        manifest,
        manifestSchemaVersion: format.schemaVersion,
      },
      select: EXPORT_SELECT,
    });
  } catch (error) {
    await localStorage.delete(key).catch(() => undefined); // compensación.
    throw error;
  }

  // ⑥ Métrica por formato + auditoría (sin PII: el manifest queda en la fila).
  recordExport(fields.formatId);
  await writeAudit({
    userId: ctx.userId,
    projectId,
    action: "export.register",
    metadata: { formatId: fields.formatId, bytes: buffer.byteLength },
  });

  return NextResponse.json({ export: await exportDto(created) }, { status: 201 });
});

/* ─────────────── GET /api/projects/:id/exports?limit=&cursor= ─────────────── */

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

  const rows = await db.export.findMany({
    where: { projectId, ...(cursorWhere(cursor) ?? {}) },
    orderBy: CURSOR_ORDER,
    take: limitParsed.data + 1,
    select: EXPORT_SELECT,
  });

  const page = rows.slice(0, limitParsed.data);
  const hasMore = rows.length > limitParsed.data;
  const last = page[page.length - 1];
  const body: Paginated<ExportDto> = {
    items: await Promise.all(page.map(exportDto)),
    nextCursor: hasMore && last !== undefined ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    hasMore,
  };
  return NextResponse.json(body);
});
