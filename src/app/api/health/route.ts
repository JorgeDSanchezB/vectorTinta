/**
 * VectorTinta — GET /api/health (plan §3.3).
 *
 * SIN auth ni rate limit (sonda de despliegue). HealthDto:
 *  - status: "ok" | "degradado" (degradado si el ping a SQLite falla).
 *  - db: "up" | "down" (ping real con try/catch: `$queryRaw SELECT 1`).
 *  - configDigest: importado de app.config (drift entre entornos detectable).
 *  - version: server.config.productVersion.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api-handler";
import { configDigest } from "@/lib/config/app.config";
import { serverConfig } from "@/lib/config/server.config";
import type { HealthDto } from "@/lib/domain/entities";
import { db } from "@/lib/db";

export const GET = withApi({}, async () => {
  let dbUp = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("[health] ping a la base de datos falló:", error);
    dbUp = false;
  }
  const body: HealthDto = {
    status: dbUp ? "ok" : "degradado",
    db: dbUp ? "up" : "down",
    configDigest,
    version: serverConfig.productVersion,
  };
  return NextResponse.json(body);
});
