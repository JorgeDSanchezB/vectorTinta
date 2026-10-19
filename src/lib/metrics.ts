/**
 * VectorTinta — Métricas en memoria (plan §3.3 GET /api/metrics).
 *
 * Contadores del proceso: peticiones por código HTTP, vectorizaciones
 * persistidas y exportaciones por formato + uptime. Producción: el recolector
 * se sustituye por un adaptador Prometheus (documentado; NO se afirma
 * implementación — misma interfaz `recordX/getMetrics`).
 *
 * El estado vive en `globalThis` para sobrevivir al hot reload de desarrollo.
 */
import type { MetricsDto } from "@/lib/domain/entities";

interface MetricsState {
  startedAt: number;
  requestsByCode: Map<string, number>;
  vectorizationsPersisted: number;
  exportsByFormat: Map<string, number>;
}

const globalForMetrics = globalThis as unknown as { __vtMetrics?: MetricsState };
const state: MetricsState =
  globalForMetrics.__vtMetrics ??
  {
    startedAt: Date.now(),
    requestsByCode: new Map(),
    vectorizationsPersisted: 0,
    exportsByFormat: new Map(),
  };
globalForMetrics.__vtMetrics = state;

/** Registra una petición terminada por su código HTTP (200, 400, 401…). */
export function recordRequest(status: number): void {
  const key = String(status);
  state.requestsByCode.set(key, (state.requestsByCode.get(key) ?? 0) + 1);
}

/** Una vectorización se ha persistido con éxito (POST /vectorize 201). */
export function recordVectorization(): void {
  state.vectorizationsPersisted += 1;
}

/** Una exportación registrada por formato (POST /exports 201). */
export function recordExport(formatId: string): void {
  state.exportsByFormat.set(formatId, (state.exportsByFormat.get(formatId) ?? 0) + 1);
}

/** Copia inmutable del estado para GET /api/metrics (MetricsDto canónico). */
export function getMetrics(): MetricsDto {
  return {
    uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
    requestsByCode: Object.fromEntries(state.requestsByCode),
    vectorizationsPersisted: state.vectorizationsPersisted,
    exportsByFormat: Object.fromEntries(state.exportsByFormat),
  };
}
