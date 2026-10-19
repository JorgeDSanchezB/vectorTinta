/**
 * VectorTinta — GET /api/assets/[...key] (plan §3.2: streaming autorizado).
 *
 * Dos vías de acceso (auth flex):
 *   (a) `?t=` token firmado por el adaptador (sign → jwt typ 'asset', TTL de
 *       server.config): la clave autorizada es el `sub` del token y DEBE
 *       coincidir con la clave pedida (un token de un recurso no vale para
 *       otro). Es la vía de <img>/descargas de los DTOs (downloadUrl/svgUrl/
 *       svgFragmentUrl son `signedPath`).
 *   (b) `Authorization: Bearer`: se localiza el recurso por storageKey y se
 *       exige que el proyecto sea del usuario (Asset y Export, según la spec;
 *       se incluyen TAMBIÉN Vectorization.svgStorageKey y Layer.svgFragmentKey
 *       — extensión documentada — para que un Bearer válido sirva de fallback
 *       cuando la URL firmada ha caducado: mismo dueño, mismo proyecto).
 *
 * Ajeno o inexistente → 404 con el MISMO cuerpo (no se filtra existencia).
 * Sin t ni Bearer → 401. Streaming del disco con Content-Type por extensión.
 */
import { NextResponse } from "next/server";
import { verifyAssetUrl } from "@/lib/auth/jwt";
import { notAuthenticated } from "@/lib/auth/guards";
import { requireAuth } from "@/lib/auth/guards";
import { withApi } from "@/lib/http/api-handler";
import { contentTypeForKey } from "@/lib/storage/adapter";
import { localStorage } from "@/lib/storage/local";
import { db } from "@/lib/db";

export const GET = withApi<{ key: string[] }>({ rate: "general" }, async (req, ctx) => {
  const key = ctx.params.key.join("/");
  const token = req.nextUrl.searchParams.get("t");

  if (token !== null) {
    // (a) URL firmada: el token autoriza EXACTAMENTE la clave pedida.
    const signedKey = verifyAssetUrl(token);
    if (signedKey !== key) throw notAuthenticated();
  } else {
    // (b) Bearer: localizar el recurso y verificar propiedad del proyecto.
    const { userId } = requireAuth(req);
    const owner = await resolveOwner(key);
    if (owner === null || owner !== userId) {
      // Ajeno o inexistente: MISMO cuerpo (política anti-filtrado, §3.3).
      return NextResponse.json(
        {
          type: "https://vectortinta.example/problems/no-encontrado",
          title: "Archivo no disponible",
          status: 404,
          detail: "El archivo no existe o no es tuyo.",
          instance: `/api/assets/${key}`,
        },
        { status: 404 },
      );
    }
  }

  // Streaming del disco (Readable.toWeb sobre fs.createReadStream). El tipo de
  // node:stream/web se alinea con el ReadableStream del DOM en el Response.
  const stream = await localStorage.getStream(key);
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "private, no-transform",
    },
  });
});

/**
 * Resuelve el ownerId del proyecto dueño de la clave consultando, por orden,
 * Asset.storageKey y Export.storageKey (según spec) y — extensión documentada —
 * Vectorization.svgStorageKey y Layer.svgFragmentKey. SELECT explícito SIEMPRE.
 * Devuelve null si la clave no corresponde a ningún recurso.
 */
async function resolveOwner(key: string): Promise<string | null> {
  const asset = await db.asset.findFirst({
    where: { storageKey: key },
    select: { project: { select: { ownerId: true } } },
  });
  if (asset !== null) return asset.project.ownerId;

  const exported = await db.export.findFirst({
    where: { storageKey: key },
    select: { project: { select: { ownerId: true } } },
  });
  if (exported !== null) return exported.project.ownerId;

  const vectorization = await db.vectorization.findFirst({
    where: { svgStorageKey: key },
    select: { asset: { select: { project: { select: { ownerId: true } } } } },
  });
  if (vectorization !== null) return vectorization.asset.project.ownerId;

  const layer = await db.layer.findFirst({
    where: { svgFragmentKey: key },
    select: { vectorization: { select: { asset: { select: { project: { select: { ownerId: true } } } } } } },
  });
  if (layer !== null) return layer.vectorization.asset.project.ownerId;

  return null;
}
