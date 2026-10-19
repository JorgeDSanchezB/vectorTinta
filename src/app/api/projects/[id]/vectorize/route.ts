/**
 * VectorTinta — POST /api/projects/:id/vectorize (NÚCLEO, plan §3.3).
 *
 * SÍNCRONO por diseño: el cálculo pesado ocurre en el Worker del CLIENTE; este
 * endpoint PERSISTE el resultado (SVG ya generado) — no se justifica cola de
 * jobs en v1 (plan §3.3, anti-sobreingeniería).
 *
 * Cadena de validación:
 *   ① body JSON completo: parseJsonBody con tope de IMAGE.maxUploadBytes
 *      (el SVG viaja en el body; el guard de 8 KiB aplica SOLO al subobjeto
 *      `params` y a los nombres de capa, no al SVG).
 *      NOTA de contrato: `VectorizeRequestSchema` (compartido) no incluye
 *      `params` porque estos validan contra el ESQUEMA DEL PRESET registrada en
 *      PresetRegistry (plan §4.2), no contra el esquema del body; se extrae
 *      ANTES del safeParse y todo lo demás sigue estricto (unknown keys → 400).
 *   ② presetId ∈ PresetRegistry → si no: 400 params-invalidos con
 *      supportedPresets (recurso enumerable, plan §4.3).
 *   ③ engineId ∈ VECTOR_ENGINE_IDS → si no: 400 con supportedEngines.
 *   ④ params: guardJson (§4.2 pasos 1-4 + safeParse contra el esquema del
 *      preset): campo de otro preset → unrecognized_key (hint genérico: el
 *      servidor no puede saber a cuál pertenece).
 *   ⑤ layers: ordenes únicos/enteros (schema), colorHex regex (schema),
 *      areaPx ≥ 0 (schema) + guard anti-PII en cada name.
 *   ⑥ sourceAssetId = Asset PROPIO del proyecto con role 'source'.
 *   ⑦ TRANSACCIÓN: guarda SVG completo + fragmentos por capa + filas
 *      Vectorization (paramsSchemaVersion del preset) y Layer[].
 *   ⑧ 201 {vectorization: VectorizationDto, layers: LayerDto[]}.
 *   ⑨ auditoría + métrica vectorizationsPersisted.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config/app.config";
import { VECTOR_ENGINE_IDS } from "@/lib/domain/entities";
import { VectorizeRequestSchema } from "@/lib/domain/requests";
import type { LayerDto, VectorizationDto } from "@/lib/domain/entities";
import { ApiProblem } from "@/lib/domain/errors";
import { withApi } from "@/lib/http/api-handler";
import { LAYER_SELECT, VECTORZ_SELECT, requireOwnedProject } from "@/lib/http/dto";
import { throwProblem, zodProblemObject } from "@/lib/http/problem";
import { assertNoPiiString, guardJson, parseJsonBody } from "@/lib/http/validate";
import { presetRegistry } from "@/lib/registries/preset-registry";
import { recordVectorization } from "@/lib/metrics";
import { writeAudit } from "@/lib/audit";
import { STORAGE_KEYS } from "@/lib/storage/adapter";
import { localStorage } from "@/lib/storage/local";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Cuenta los nodos geométricos del SVG (path, círculos, polígonos…). */
function countSvgNodes(svg: string): number {
  const matches = svg.match(/<(?:path|circle|ellipse|rect|line|polyline|polygon)\b/gi);
  return matches === null ? 0 : matches.length;
}

export const POST = withApi<{ id: string }>({ auth: true, rate: "mutations" }, async (req, ctx) => {
  const projectId = ctx.params.id;
  const instance = `/api/projects/${projectId}/vectorize`;
  await requireOwnedProject(ctx.userId as string, projectId, instance);

  // ① Cuerpo completo: puede pesar hasta el máximo de subida (lleva el SVG).
  const raw = (await parseJsonBody(req, appConfig.limits.image.maxUploadBytes)) as Record<string, unknown>;

  // `params` se valida contra el esquema del PRESET (registro), no del body.
  const { params: candidateParams, ...rest } = raw;
  const bodyParsed = VectorizeRequestSchema.safeParse(rest);
  if (!bodyParsed.success) {
    throw new ApiProblem(zodProblemObject(bodyParsed.error, instance));
  }
  const body = bodyParsed.data;

  // ② Preset registrado (recurso enumerable en el error, plan §4.3).
  const preset = presetRegistry.get(body.presetId);
  if (preset === undefined) {
    throwProblem("params-invalidos", {
      title: "Preset no válido",
      detail: `El preset "${body.presetId}" no está registrado.`,
      instance,
      errors: [{ field: "presetId", code: "unsupported_preset" }],
      supportedPresets: presetRegistry.ids(),
    });
  }

  // ③ Engine reconocido (lista cerrada del contrato compartido).
  if (!VECTOR_ENGINE_IDS.includes(body.engineId as (typeof VECTOR_ENGINE_IDS)[number])) {
    throwProblem("params-invalidos", {
      title: "Motor no válido",
      detail: `El motor "${body.engineId}" no está soportado.`,
      instance,
      errors: [{ field: "engineId", code: "unsupported_engine" }],
      supportedEngines: [...VECTOR_ENGINE_IDS],
    });
  }

  // ④ params contra el esquema del preset (guardas §4.2 + safeParse estricto).
  if (candidateParams === undefined) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "Falta el objeto params del preset.",
      instance,
      errors: [{ field: "params", code: "invalid_type", expected: "object" }],
    });
  }
  const params = guardJson(candidateParams, {
    schema: preset.schema,
    fieldPrefix: "params",
    instance,
  }) as Record<string, unknown>;

  // ⑤ Capas: ordenes únicos (el schema ya garantiza enteros en rango y hex).
  const ordenes = new Set<number>();
  for (const [index, layer] of body.layers.entries()) {
    if (ordenes.has(layer.orden)) {
      throwProblem("validacion", {
        title: "Cuerpo inválido",
        detail: "Los ordenes de capa deben ser únicos dentro de la vectorización.",
        instance,
        errors: [{ field: `layers.${index}.orden`, code: "duplicate_orden" }],
      });
    }
    ordenes.add(layer.orden);
    // Guard anti-PII del plan §4.2 aplicado a cada nombre de capa.
    assertNoPiiString(layer.name, `layers.${index}.name`, instance);
  }

  // ⑥ Origen válido: Asset propio del proyecto con role 'source'.
  const source = await db.asset.findFirst({
    where: { id: body.sourceAssetId, projectId, role: "source" },
    select: { id: true },
  });
  if (source === null) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "sourceAssetId no es una imagen de origen de este proyecto.",
      instance,
      errors: [{ field: "sourceAssetId", code: "invalid_reference" }],
    });
  }

  // Invariante §2.2: nodeCount > 0. El contrato del body solo transporta el
  // SVG (el nodeCount del motor vive en el cliente), así que se DERIVA aquí de
  // forma determinista: nº de elementos geométricos del documento.
  const nodeCount = countSvgNodes(body.svg);
  if (nodeCount <= 0) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "El SVG no contiene geometría (nodeCount debe ser > 0).",
      instance,
      errors: [{ field: "svg", code: "no_geometry" }],
    });
  }

  // ⑦ Persistencia: archivos primero (claves dependientes de los ids) y
  // transacción después; si la transacción falla, se retiran los archivos
  // (compensación best-effort).
  const vectorizationId = randomUUID();
  const svgKey = STORAGE_KEYS.vectorSvg(projectId, vectorizationId);
  const layerRows = body.layers.map((layer) => ({
    id: randomUUID(),
    vectorizationId,
    orden: layer.orden,
    colorHex: layer.colorHex,
    name: layer.name,
    svgFragmentKey: STORAGE_KEYS.layerFragment(projectId, randomUUID()),
    areaPx: layer.areaPx,
    visible: true,
  }));

  const writtenKeys: string[] = [svgKey];
  try {
    await localStorage.putBuffer(svgKey, Buffer.from(body.svg, "utf8"));
    for (const [index, layer] of body.layers.entries()) {
      await localStorage.putBuffer(
        layerRows[index].svgFragmentKey,
        Buffer.from(layer.fragmentSvg, "utf8"),
      );
      writtenKeys.push(layerRows[index].svgFragmentKey);
    }

    await db.$transaction(async (tx) => {
      await tx.vectorization.create({
        data: {
          id: vectorizationId,
          assetId: body.sourceAssetId,
          engineId: body.engineId,
          presetId: body.presetId,
          params: params as Prisma.InputJsonValue,
          paramsSchemaVersion: preset.schemaVersion,
          svgStorageKey: svgKey,
          nodeCount,
        },
        select: { id: true },
      });
      await tx.layer.createMany({
        data: layerRows.map((row) => ({
          id: row.id,
          vectorizationId: row.vectorizationId,
          orden: row.orden,
          colorHex: row.colorHex,
          name: row.name,
          svgFragmentKey: row.svgFragmentKey,
          areaPx: row.areaPx,
          visible: true,
        })),
      });
    });
  } catch (error) {
    for (const key of writtenKeys) {
      await localStorage.delete(key).catch(() => undefined);
    }
    throw error;
  }

  const stored = await db.vectorization.findUnique({
    where: { id: vectorizationId },
    select: VECTORZ_SELECT,
  });
  if (stored === null) {
    // Inalcanzable salvo borrado concurrente: se reporta como interno.
    throwProblem("interno", { title: "Error interno", detail: "La vectorización no se pudo leer tras persistirla.", instance });
  }

  const layers = await db.layer.findMany({
    where: { vectorizationId },
    orderBy: { orden: "asc" },
    select: LAYER_SELECT,
  });

  // ⑨ Métrica + auditoría (solo ids/contadores en metadata).
  recordVectorization();
  await writeAudit({
    userId: ctx.userId,
    projectId,
    action: "vectorization.persist",
    metadata: {
      presetId: body.presetId,
      engineId: body.engineId,
      layerCount: body.layers.length,
      nodeCount,
    },
  });

  // ⑧ 201 canónico: {vectorization: VectorizationDto, layers: LayerDto[]}.
  const vectorization: VectorizationDto = {
    id: stored.id,
    presetId: stored.presetId,
    engineId: stored.engineId,
    params: params as unknown as VectorizationDto["params"],
    paramsSchemaVersion: stored.paramsSchemaVersion,
    nodeCount: stored.nodeCount,
    svgUrl: await localStorage.signedPath(stored.svgStorageKey),
    createdAt: stored.createdAt.toISOString(),
  };
  const layerDtos: LayerDto[] = await Promise.all(
    layers.map(async (row) => ({
      id: row.id,
      vectorizationId: row.vectorizationId,
      orden: row.orden,
      colorHex: row.colorHex,
      name: row.name,
      areaPx: row.areaPx,
      visible: row.visible,
      svgFragmentUrl: await localStorage.signedPath(row.svgFragmentKey),
      createdAt: row.createdAt.toISOString(),
    })),
  );

  return NextResponse.json({ vectorization, layers: layerDtos }, { status: 201 });
});
