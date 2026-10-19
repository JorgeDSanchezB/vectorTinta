/**
 * VectorTinta — GET /api/metrics (plan §3.3).
 *
 * Contadores en memoria del proceso (uptime, peticiones por código, capas
 * vectorizadas persistidas, exportaciones por formato). En el sandbox queda
 * abierto (verificación del listón); en producción se protege por red interna
 * y el recolector se sustituye por un adaptador Prometheus (documentado).
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api-handler";
import { getMetrics } from "@/lib/metrics";

export const GET = withApi({}, async () => NextResponse.json(getMetrics()));
