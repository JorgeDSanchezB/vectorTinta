/**
 * VectorTinta — /api/projects (plan §3.2/§3.3).
 *
 * POST: crea proyecto (auth + mutations). Cuota del plan free → 409
 * `cuota-proyectos` CANÓNICO con errors [{resource:'projects', code:'quota_exceeded', limit}]
 * (límite desde app.config: cero hardcoding).
 *
 * GET: listado paginado por cursor compuesto `?limit=&cursor=`
 * (ADR-010): WHERE (createdAt, id) < cursor ORDER BY createdAt DESC, id DESC
 * LIMIT limit+1. layerCount = capas de la ÚLTIMA vectorización de cada
 * proyecto, resuelto con 3 consultas agregadas (sin N+1): página → última
 * vectorización por proyecto → conteo agrupado de capas.
 */
import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config/app.config";
import { CreateProjectRequestSchema, CursorSchema, LimitSchema } from "@/lib/domain/requests";
import type { Paginated, ProjectListItemDto } from "@/lib/domain/entities";
import { ApiProblem } from "@/lib/domain/errors";
import { withApi } from "@/lib/http/api-handler";
import { CURSOR_ORDER, cursorWhere, decodeCursor, encodeCursor } from "@/lib/http/cursor";
import { PROJECT_SELECT, projectDto, projectListItemDto } from "@/lib/http/dto";
import { requestPath } from "@/lib/http/problem";
import { zodProblemObject } from "@/lib/http/problem";
import { throwProblem } from "@/lib/http/problem";
import { parseStrictBody } from "@/lib/http/validate";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

/* ─────────────────────────── POST /api/projects ─────────────────────────── */

export const POST = withApi({ auth: true, rate: "mutations" }, async (req, ctx) => {
  const body = await parseStrictBody(req, CreateProjectRequestSchema);
  const instance = requestPath(req.url);

  // Cuota del plan gratuito (config): count + 409 canónico del plan §3.1.
  const limit = appConfig.limits.projects.maxPerUserFree;
  const owned = await db.project.count({ where: { ownerId: ctx.userId } });
  if (owned >= limit) {
    throwProblem("cuota-proyectos", {
      title: "Cuota de proyectos excedida",
      detail: `El plan free permite ${limit} proyectos. Borra uno o pasa a pro.`,
      instance,
      errors: [{ resource: "projects", code: "quota_exceeded", limit }],
    });
  }

  const project = await db.project.create({
    data: { ownerId: ctx.userId as string, name: body.name, description: body.description ?? null },
    select: PROJECT_SELECT,
  });

  await writeAudit({
    userId: ctx.userId,
    projectId: project.id,
    action: "project.create",
    metadata: {}, // nombre/descripción NUNCA en metadata (posible PII libre del usuario).
  });

  return NextResponse.json({ project: projectDto(project) }, { status: 201 });
});

/* ────────────────────── GET /api/projects (paginado) ────────────────────── */

export const GET = withApi({ auth: true, rate: "general" }, async (req, ctx) => {
  const params = req.nextUrl.searchParams;
  const limitRaw = params.get("limit");
  const cursorRaw = params.get("cursor");

  const limitParsed = LimitSchema.safeParse(limitRaw === null || limitRaw === "" ? undefined : limitRaw);
  if (!limitParsed.success) {
    throw new ApiProblem(zodProblemObject(limitParsed.error, requestPath(req.url)));
  }
  const limit = limitParsed.data;

  const cursorParsed = CursorSchema.safeParse(cursorRaw === null || cursorRaw === "" ? undefined : cursorRaw);
  if (!cursorParsed.success) {
    throw new ApiProblem(zodProblemObject(cursorParsed.error, requestPath(req.url)));
  }
  const cursor = cursorParsed.data !== undefined ? decodeCursor(cursorParsed.data) : undefined;

  // (1/3) Página del índice compuesto: take limit+1 para detectar hasMore.
  const rows = await db.project.findMany({
    where: { ownerId: ctx.userId as string, ...(cursorWhere(cursor) ?? {}) },
    orderBy: CURSOR_ORDER,
    take: limit + 1,
    select: PROJECT_SELECT,
  });

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  const layerCounts = await resolveLayerCounts(page.map((row) => row.id));

  const items: ProjectListItemDto[] = await Promise.all(
    page.map(async (row) => projectListItemDto(row, layerCounts.get(row.id) ?? 0)),
  );

  const last = page[page.length - 1];
  const body: Paginated<ProjectListItemDto> = {
    items,
    nextCursor: hasMore && last !== undefined ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    hasMore,
  };
  return NextResponse.json(body);
});

/**
 * layerCount por proyecto (nº de capas de la ÚLTIMA vectorización) en DOS
 * consultas agregadas sobre la página: vectorizaciones orden asc → la última
 * por proyecto gana en el Map; groupBy de capas por vectorización.
 */
async function resolveLayerCounts(projectIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (projectIds.length === 0) return result;

  const vectorizations = await db.vectorization.findMany({
    where: { asset: { projectId: { in: projectIds } } },
    select: { id: true, asset: { select: { projectId: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], // asc: el último sobreescribe en el Map.
  });

  const lastByProject = new Map<string, string>();
  for (const v of vectorizations) {
    lastByProject.set(v.asset.projectId, v.id);
  }
  const lastIds = [...lastByProject.values()];
  if (lastIds.length === 0) return result;

  const grouped = await db.layer.groupBy({
    by: ["vectorizationId"],
    where: { vectorizationId: { in: lastIds } },
    _count: { _all: true },
  });
  const countByVectorization = new Map<string, number>();
  for (const row of grouped) {
    const value = (row as { _count?: { _all?: number } })._count?._all ?? 0;
    countByVectorization.set(row.vectorizationId, typeof value === "number" ? value : 0);
  }
  for (const [projectId, vectorizationId] of lastByProject) {
    result.set(projectId, countByVectorization.get(vectorizationId) ?? 0);
  }
  return result;
}
