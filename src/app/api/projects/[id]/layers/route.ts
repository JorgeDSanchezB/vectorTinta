/**
 * VectorTinta — /api/projects/:id/layers (plan §3.2/§3.3).
 *
 * GET: paginación por cursor compuesto de las capas de la ÚLTIMA vectorización.
 * NOTA de contrato: el cursor transversal es (createdAt, id) DESC (§3.1 — "el
 * contrato es el contrato"); las capas de una vectorización comparten createdAt
 * y el desempate por id es suficiente. La vista canónica orden ASC por `orden`
 * la sirve GET /api/projects/:id (ProjectWorkspaceDto), que es el contrato
 * central del punto 7 del listón.
 *
 * POST: DUPLICAR capa (CreateLayerRequestSchema {sourceLayerId, colorHex?,
 * name?}): copia el fragmento físico a una clave nueva, orden = max+1 (si ya
 * hay maxPerVectorization capas → 409 capas-maximas). 201 LayerDto.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config/app.config";
import { CreateLayerRequestSchema, CursorSchema, LimitSchema } from "@/lib/domain/requests";
import type { LayerDto, Paginated } from "@/lib/domain/entities";
import { ApiProblem } from "@/lib/domain/errors";
import { withApi } from "@/lib/http/api-handler";
import { CURSOR_ORDER, cursorWhere, decodeCursor, encodeCursor } from "@/lib/http/cursor";
import { LAYER_SELECT, VECTORZ_SELECT, layerDto, requireOwnedProject } from "@/lib/http/dto";
import { throwProblem, zodProblemObject } from "@/lib/http/problem";
import { assertNoPiiString, parseStrictBody } from "@/lib/http/validate";
import { writeAudit } from "@/lib/audit";
import { STORAGE_KEYS } from "@/lib/storage/adapter";
import { copyFragment, localStorage } from "@/lib/storage/local";
import { db } from "@/lib/db";

/* ──────────── GET /api/projects/:id/layers?limit=&cursor= ──────────── */

export const GET = withApi<{ id: string }>({ auth: true, rate: "general" }, async (req, ctx) => {
  const projectId = ctx.params.id;
  const instance = `/api/projects/${projectId}/layers`;
  await requireOwnedProject(ctx.userId as string, projectId, instance);

  const search = req.nextUrl.searchParams;
  const limitParsed = LimitSchema.safeParse(search.get("limit") === null || search.get("limit") === "" ? undefined : search.get("limit"));
  if (!limitParsed.success) throw new ApiProblem(zodProblemObject(limitParsed.error, instance));
  const cursorParsed = CursorSchema.safeParse(search.get("cursor") === null || search.get("cursor") === "" ? undefined : search.get("cursor"));
  if (!cursorParsed.success) throw new ApiProblem(zodProblemObject(cursorParsed.error, instance));
  const cursor = cursorParsed.data !== undefined ? decodeCursor(cursorParsed.data) : undefined;

  const vectorization = await db.vectorization.findFirst({
    where: { asset: { projectId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (vectorization === null) {
    const empty: Paginated<LayerDto> = { items: [], nextCursor: null, hasMore: false };
    return NextResponse.json(empty);
  }

  const rows = await db.layer.findMany({
    where: { vectorizationId: vectorization.id, ...(cursorWhere(cursor) ?? {}) },
    orderBy: CURSOR_ORDER,
    take: limitParsed.data + 1,
    select: LAYER_SELECT,
  });

  const page = rows.slice(0, limitParsed.data);
  const hasMore = rows.length > limitParsed.data;
  const last = page[page.length - 1];
  const body: Paginated<LayerDto> = {
    items: await Promise.all(page.map(layerDto)),
    nextCursor: hasMore && last !== undefined ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    hasMore,
  };
  return NextResponse.json(body);
});

/* ───────────────── POST /api/projects/:id/layers (duplicar) ───────────────── */

export const POST = withApi<{ id: string }>({ auth: true, rate: "mutations" }, async (req, ctx) => {
  const projectId = ctx.params.id;
  const instance = `/api/projects/${projectId}/layers`;
  const body = await parseStrictBody(req, CreateLayerRequestSchema);
  await requireOwnedProject(ctx.userId as string, projectId, instance);

  // La capa origen debe existir en el proyecto (a través de su vectorización).
  const source = await db.layer.findFirst({
    where: { id: body.sourceLayerId, vectorization: { asset: { projectId } } },
    select: LAYER_SELECT,
  });
  if (source === null) {
    throwProblem("no-encontrado", {
      title: "Capa no disponible",
      detail: "La capa no existe o no pertenece a este proyecto.",
      instance,
    });
  }

  // Guard anti-PII del nombre (§4.2), igual que en /vectorize.
  const newName = body.name ?? source.name;
  assertNoPiiString(newName, "name", instance);

  const vectorization = await db.vectorization.findUnique({
    where: { id: source.vectorizationId },
    select: VECTORZ_SELECT,
  });
  if (vectorization === null) {
    throwProblem("no-encontrado", {
      title: "Vectorización no disponible",
      detail: "La vectorización de la capa ya no existe.",
      instance,
    });
  }

  // Cuota de capas por vectorización (config) → 409 capas-maximas.
  const limit = appConfig.limits.layers.maxPerVectorization;
  const existing = await db.layer.count({ where: { vectorizationId: source.vectorizationId } });
  if (existing >= limit) {
    throwProblem("capas-maximas", {
      title: "Máximo de capas alcanzado",
      detail: `La vectorización ya tiene ${limit} capas: fusiona por cercanía de color.`,
      instance,
      errors: [{ resource: "layers", code: "quota_exceeded", limit }],
    });
  }

  // orden = máximo actual + 1 (hueco tras borrados futuros); si excede el
  // rango permitido por el schema (maxPerVectorization-1) → capas-maximas.
  const maxOrden = await db.layer.aggregate({
    where: { vectorizationId: source.vectorizationId },
    _max: { orden: true },
  });
  const nextOrden = (maxOrden._max.orden ?? -1) + 1;
  if (nextOrden >= limit) {
    throwProblem("capas-maximas", {
      title: "Máximo de capas alcanzado",
      detail: `La vectorización ya tiene ${limit} capas: fusiona por cercanía de color.`,
      instance,
      errors: [{ resource: "layers", code: "quota_exceeded", limit }],
    });
  }

  const layerId = randomUUID();
  const fragmentKey = STORAGE_KEYS.layerFragment(projectId, layerId);

  // Copia física del fragmento a la clave nueva (la fuente sigue intacta).
  await copyFragment(source.svgFragmentKey, fragmentKey);

  let created;
  try {
    created = await db.layer.create({
      data: {
        id: layerId,
        vectorizationId: source.vectorizationId,
        orden: nextOrden,
        colorHex: body.colorHex ?? source.colorHex,
        name: newName,
        svgFragmentKey: fragmentKey,
        areaPx: source.areaPx,
        visible: source.visible,
      },
      select: LAYER_SELECT,
    });
  } catch (error) {
    await localStorage.delete(fragmentKey).catch(() => undefined); // compensación.
    throw error;
  }

  await writeAudit({
    userId: ctx.userId,
    projectId,
    action: "layer.create",
    metadata: { vectorizationId: source.vectorizationId, duplicatedFrom: source.id },
  });

  return NextResponse.json({ layer: await layerDto(created) }, { status: 201 });
});
