/**
 * VectorTinta — /api/projects/:id (plan §3.3; contrato central del listón).
 *
 * GET: ProjectWorkspaceDto — reconstrucción COMPLETA del espacio de trabajo
 * tras una recarga: project + assets[] + ÚLTIMA vectorización (params
 * revalidados con MigrationRegistry al leer) + layers[] orden ASC.
 * Inexistente O ajeno → 404 con el MISMO cuerpo (no se filtra existencia).
 *
 * PATCH: renombra/describe/fija miniatura. `thumbnailKey` debe ser un Asset
 * PROPIO del proyecto con role 'thumbnail' (si no → 400 validación).
 *
 * DELETE: borra registros en cascada + archivos físicos del proyecto
 * (best-effort: un fallo de disco NO rompe el borrado lógico). 204.
 */
import { NextResponse } from "next/server";
import { PatchProjectRequestSchema } from "@/lib/domain/requests";
import type { ProjectWorkspaceDto } from "@/lib/domain/entities";
import { withApi } from "@/lib/http/api-handler";
import { throwProblem } from "@/lib/http/problem";
import { parseStrictBody } from "@/lib/http/validate";
import {
  ASSET_SELECT,
  LAYER_SELECT,
  PROJECT_SELECT,
  VECTORZ_SELECT,
  assetDto,
  layerDto,
  projectDto,
  requireOwnedProject,
  vectorizationDto,
} from "@/lib/http/dto";
import { localStorage } from "@/lib/storage/local";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

/* ─────────────────── GET /api/projects/:id (workspace) ─────────────────── */

export const GET = withApi<{ id: string }>({ auth: true, rate: "general" }, async (req, ctx) => {
  const projectId = ctx.params.id;
  const project = await requireOwnedProject(ctx.userId as string, projectId, `/api/projects/${projectId}`);

  const assets = await db.asset.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: ASSET_SELECT,
  });

  // ÚLTIMA vectorización del proyecto (a través de sus assets).
  const vectorization = await db.vectorization.findFirst({
    where: { asset: { projectId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: VECTORZ_SELECT,
  });

  const layers =
    vectorization !== null
      ? await db.layer.findMany({
          where: { vectorizationId: vectorization.id },
          orderBy: { orden: "asc" }, // vista canónica de trabajo: orden de impresión
          select: LAYER_SELECT,
        })
      : [];

  const body: ProjectWorkspaceDto = {
    project: projectDto(project),
    assets: await Promise.all(assets.map(assetDto)),
    vectorization: vectorization !== null ? await vectorizationDto(vectorization) : null,
    layers: await Promise.all(layers.map(layerDto)),
  };
  void req;
  return NextResponse.json(body);
});

/* ───────────────────────── PATCH /api/projects/:id ───────────────────────── */

export const PATCH = withApi<{ id: string }>({ auth: true, rate: "mutations" }, async (req, ctx) => {
  const projectId = ctx.params.id;
  const body = await parseStrictBody(req, PatchProjectRequestSchema);
  const project = await requireOwnedProject(ctx.userId as string, projectId, `/api/projects/${projectId}`);

  // La miniatura debe ser un Asset propio del proyecto con role 'thumbnail'.
  let resolvedThumbnailKey: string | undefined;
  if (body.thumbnailKey !== undefined || body.thumbnailAssetId !== undefined) {
    const where =
      body.thumbnailAssetId !== undefined
        ? { id: body.thumbnailAssetId, projectId, role: "thumbnail" as const }
        : { storageKey: body.thumbnailKey as string, projectId, role: "thumbnail" as const };
    const thumb = await db.asset.findFirst({ where, select: { id: true, storageKey: true } });
    if (thumb === null) {
      throwProblem("validacion", {
        title: "Cuerpo inválido",
        detail: "La miniatura no corresponde a un asset propio de este proyecto.",
        instance: `/api/projects/${projectId}`,
        errors: [
          body.thumbnailAssetId !== undefined
            ? { field: "thumbnailAssetId", code: "invalid_reference" }
            : { field: "thumbnailKey", code: "invalid_reference" },
        ],
      });
    }
    resolvedThumbnailKey = thumb.storageKey;
  }

  const updated = await db.project.update({
    where: { id: project.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(resolvedThumbnailKey !== undefined ? { thumbnailKey: resolvedThumbnailKey } : {}),
    },
    select: PROJECT_SELECT,
  });

  await writeAudit({
    userId: ctx.userId,
    projectId,
    action: "project.patch",
    metadata: { fields: Object.keys(body).join(",") }, // nombres de campo, no valores.
  });

  return NextResponse.json({ project: projectDto(updated) });
});

/* ──────────────────────── DELETE /api/projects/:id ──────────────────────── */

export const DELETE = withApi<{ id: string }>({ auth: true, rate: "mutations" }, async (_req, ctx) => {
  const projectId = ctx.params.id;
  const project = await requireOwnedProject(ctx.userId as string, projectId, `/api/projects/${projectId}`);

  // Registros primero (cascada: assets, vectorizaciones, capas, exports, auditoría).
  await db.project.delete({ where: { id: project.id } });

  // Archivos físicos: best-effort (fallo de disco ≠ fallo de la petición).
  try {
    await localStorage.deleteProjectDir(projectId);
  } catch (error) {
    console.error(`[storage] no se pudieron borrar los archivos de ${projectId}:`, error);
  }

  // Auditoría SIN projectId: AuditEvent.project es Cascade (unidad de
  // privacidad), así que el evento sobrevive solo si no referencia al proyecto.
  await writeAudit({ userId: ctx.userId, action: "project.delete", metadata: {} });

  return new NextResponse(null, { status: 204 });
});
