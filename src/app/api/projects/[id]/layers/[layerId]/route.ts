/**
 * VectorTinta — PATCH /api/projects/:id/layers/:layerId (plan §3.2).
 *
 * Actualiza colorHex/name/visible/orden. 200 LayerDto COMPLETO.
 *
 * SEMÁNTICA DE INTERCAMBIO de `orden` (invariante @@unique(vectorizationId,
 * orden)): si el orden objetivo ya lo tiene OTRA capa de la MISMA
 * vectorización, las dos se INTERCAMBIAN dentro de una transacción:
 *   1. la otra capa pasa a un orden temporal NEGATIVO (fuera del dominio
 *      0..max-1, imposible de colisionar con datos reales ni con el único
 *      temporal vivo),
 *   2. la capa objetivo toma el orden pedido,
 *   3. la otra capa toma el orden VIEJO de la objetivo.
 * El resultado es un swap exacto, nunca un desplazamiento en cascada: la
 * vista "tintas" del taller intercambia posiciones de impresión.
 */
import { NextResponse } from "next/server";
import { PatchLayerRequestSchema } from "@/lib/domain/requests";
import { withApi } from "@/lib/http/api-handler";
import { LAYER_SELECT, layerDto, requireOwnedProject } from "@/lib/http/dto";
import { throwProblem } from "@/lib/http/problem";
import { assertNoPiiString, parseStrictBody } from "@/lib/http/validate";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

export const PATCH = withApi<{ id: string; layerId: string }>(
  { auth: true, rate: "mutations" },
  async (req, ctx) => {
    const { id: projectId, layerId } = ctx.params;
    const instance = `/api/projects/${projectId}/layers/${layerId}`;
    const body = await parseStrictBody(req, PatchLayerRequestSchema);
    await requireOwnedProject(ctx.userId as string, projectId, instance);

    // La capa debe pertenecer a una vectorización de ESTE proyecto.
    const layer = await db.layer.findFirst({
      where: { id: layerId, vectorization: { asset: { projectId } } },
      select: { ...LAYER_SELECT, vectorization: { select: { id: true } } },
    });
    if (layer === null) {
      throwProblem("no-encontrado", {
        title: "Capa no disponible",
        detail: "La capa no existe o no pertenece a este proyecto.",
        instance,
      });
    }

    if (body.name !== undefined) {
      assertNoPiiString(body.name, "name", instance);
    }

    await db.$transaction(async (tx) => {
      if (body.orden !== undefined && body.orden !== layer.orden) {
        // Intercambio con la capa que ya tiene el orden objetivo (si existe).
        const other = await tx.layer.findFirst({
          where: { vectorizationId: layer.vectorizationId, orden: body.orden },
          select: { id: true, orden: true },
        });
        if (other !== null) {
          // 1. orden temporal negativo (único, fuera del dominio real).
          await tx.layer.update({
            where: { id: other.id },
            data: { orden: -(layer.orden + 1) },
            select: { id: true },
          });
          // 2. la capa pedida toma el orden objetivo.
          await tx.layer.update({
            where: { id: layer.id },
            data: { orden: body.orden as number },
            select: { id: true },
          });
          // 3. la otra capa hereda el orden viejo: swap completo.
          await tx.layer.update({
            where: { id: other.id },
            data: { orden: layer.orden },
            select: { id: true },
          });
        } else {
          // Hueco libre: solo se mueve la capa.
          await tx.layer.update({
            where: { id: layer.id },
            data: { orden: body.orden },
            select: { id: true },
          });
        }
      }

      await tx.layer.update({
        where: { id: layer.id },
        data: {
          ...(body.colorHex !== undefined ? { colorHex: body.colorHex } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.visible !== undefined ? { visible: body.visible } : {}),
        },
        select: { id: true },
      });
    });

    const updated = await db.layer.findUnique({
      where: { id: layer.id },
      select: LAYER_SELECT,
    });
    if (updated === null) {
      throwProblem("no-encontrado", {
        title: "Capa no disponible",
        detail: "La capa no existe o no pertenece a este proyecto.",
        instance,
      });
    }

    await writeAudit({
      userId: ctx.userId,
      projectId,
      action: "layer.patch",
      metadata: {
        vectorizationId: updated.vectorizationId,
        fields: Object.keys(body).join(","),
        swapped: body.orden !== undefined && body.orden !== layer.orden,
      },
    });

    return NextResponse.json({ layer: await layerDto(updated) });
  },
);
