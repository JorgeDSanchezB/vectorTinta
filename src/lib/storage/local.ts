/**
 * VectorTinta — Adaptador de almacenamiento LOCAL (disco, ADR-006).
 *
 * Raíz: server.config.storageDir (`.data/storage` por defecto). Las claves
 * siguen la convención fija `projects/{id}/…` y se SANITIZAN: se rechazan
 * segmentos `..`, rutas absolutas, backslashes y caracteres de control —
 * ninguna operación puede salir de la raíz (traversal imposible por
 * construcción). El streaming usa `Readable.toWeb` sobre `fs.createReadStream`
 * (verificado en el runtime Bun del entorno).
 *
 * Producción: sustituir por el adaptador S3/MinIO con la MISMA interfaz.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { serverConfig } from "@/lib/config/server.config";
import { ApiProblem, makeProblem } from "@/lib/domain/errors";
import { signAssetUrl } from "@/lib/auth/jwt";
import {
  STORAGE_KEYS,
  contentTypeForKey,
  type PutResult,
  type StorageAdapter,
} from "@/lib/storage/adapter";

/** Raíz absoluta del almacén (resuelta respecto al CWD del proceso). */
const ROOT = resolve(process.cwd(), serverConfig.storageDir);

/** Sanitiza la clave: convención `a/b/c.ext`, sin traversal ni rutas absolutas. */
function safePath(key: string): string {
  if (
    key.length === 0 ||
    key.includes("\\") ||
    key.includes("..") ||
    key.startsWith("/") ||
    /[\u0000-\u001f]/u.test(key)
  ) {
    throw new ApiProblem(
      makeProblem("validacion", {
        title: "Clave de almacenamiento inválida",
        detail: "La clave no respeta la convención projects/{proyecto}/…",
      }),
    );
  }
  const absolute = join(ROOT, key);
  if (!absolute.startsWith(ROOT)) {
    // Segunda barrera (por si la unión reintrodujera un salto).
    throw new ApiProblem(
      makeProblem("validacion", {
        title: "Clave de almacenamiento inválida",
        detail: "La clave escapa de la raíz del almacén.",
      }),
    );
  }
  return absolute;
}

class LocalStorageAdapter implements StorageAdapter {
  async put(key: string, data: Blob, _meta: { checksum: string }): Promise<PutResult> {
    void _meta; // el checksum se revalida en la ruta; aquí queda para trazabilidad de adaptadores remotos.
    const absolute = safePath(key);
    await mkdir(dirname(absolute), { recursive: true });
    const buffer = Buffer.from(await data.arrayBuffer());
    await writeFile(absolute, buffer);
    return { key, bytes: buffer.byteLength };
  }

  /** Escritura directa desde Buffer (rutas de subida: revalidación sha-256). */
  async putBuffer(key: string, data: Buffer): Promise<PutResult> {
    const absolute = safePath(key);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, data);
    return { key, bytes: data.byteLength };
  }

  async getStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const absolute = safePath(key);
    const info = await stat(absolute).catch(() => null);
    if (info === null || !info.isFile()) {
      throw missing(key);
    }
    const nodeStream = createReadStream(absolute);
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async exists(key: string): Promise<boolean> {
    const absolute = safePath(key);
    const info = await stat(absolute).catch(() => null);
    return info !== null && info.isFile();
  }

  async delete(key: string): Promise<void> {
    const absolute = safePath(key);
    await unlink(absolute).catch(() => undefined); // idempotente.
  }

  async sign(key: string, ttlSeconds: number): Promise<string> {
    void ttlSeconds; // el TTL lo fija server.config.signedUrlTtlSeconds en jwt.signAssetUrl.
    return signAssetUrl(key);
  }

  /** URL relativa firmada para <img>/descargas: /api/assets/{key}?t={token}. */
  async signedPath(key: string): Promise<string> {
    const token = await this.sign(key, serverConfig.signedUrlTtlSeconds);
    return `/api/assets/${key}?t=${encodeURIComponent(token)}`;
  }

  /**
   * Borrado en cascada del directorio de un proyecto (DELETE /projects/:id).
   * Best-effort: fallo de disco NO rompe el borrado lógico (se registra).
   */
  async deleteProjectDir(projectId: string): Promise<void> {
    const absolute = safePath(STORAGE_KEYS.projectDir(projectId));
    await rm(absolute, { recursive: true, force: true });
  }
}

function missing(key: string): ApiProblem {
  void key; // no se filtra la clave en el cuerpo (política de 404 uniforme).
  return new ApiProblem(
    makeProblem("no-encontrado", {
      title: "Archivo no disponible",
      detail: "El archivo no existe o no es tuyo.",
    }),
  );
}

/** Singleton del adaptador local (inyección en las rutas). */
export const localStorage = new LocalStorageAdapter();

/** Copia un fragmento ya almacenado a una clave nueva (duplicar capa). */
export async function copyFragment(fromKey: string, toKey: string): Promise<PutResult> {
  const from = safePath(fromKey);
  const to = safePath(toKey);
  await mkdir(dirname(to), { recursive: true });
  await pipeline(createReadStream(from), createWriteStream(to));
  const info = await stat(to);
  return { key: toKey, bytes: info.size };
}

export { contentTypeForKey };
