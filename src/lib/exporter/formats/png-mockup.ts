/**
 * VectorTinta — Formato `png-mockup` (plan §3.3).
 *
 * ⚠️ CORRE EN EL HILO PRINCIPAL: la rasterización real de un SVG requiere
 * <img>/Blob/objectURL + canvas.toBlob (APIs de DOM), que NO existen dentro de
 * un Worker clásico ni en Bun. Por eso el export.worker.ts RECHAZA este
 * formato y la UI lo construye aquí.
 *
 * Frontera diseñada para ser verificable sin navegador:
 *  - `buildMockupManifest`: construcción PURA + validación contra el esquema
 *    compartido PngMockupManifestSchema (verificable con bun).
 *  - `buildMockup(input, deps?)`: composición completa con INYECCIÓN de
 *    dependencias (`MockupDeps`: carga de imagen + fábrica de canvas). La
 *    implementación real de navegador vive en `../browser-renderer.ts`
 *    (`createBrowserMockupDeps`), pequeña y clara; los scripts de verificación
 *    inyectan deps falsos.
 *
 * Composición: capas visibles en orden de apilado (`orden` ASC: la capa 0 es
 * la base), cada fragmentSvg rasterizado con fill=colorHex aplicado
 * (normalizado en `svg-fragment.ts`); fondo del lienzo transparente; PNG por
 * canvas.toBlob('image/png').
 */
import { appConfig } from "@/lib/config/app.config";
import { makeProblem } from "@/lib/domain/errors";
import { PngMockupManifestSchema, type PngMockupManifest } from "@/lib/registries/formats/manifests";
import { ExportFailure, type Exporter, type ExporterInput } from "../types";
import { normalizeLayerSvg } from "../svg-fragment";
import { createBrowserMockupDeps, type MockupDeps } from "../browser-renderer";
import type { ExportRequestPayload, MockupExportResult } from "@/lib/domain/worker-protocol";

// Los tipos de las dependencias de rasterización viven en browser-renderer
// (la frontera con el DOM); se re-exportan aquí por comodidad del consumidor.
export type { LayerImage, MockupCanvas, MockupDeps } from "../browser-renderer";

/**
 * Manifest del mockup (PURO, sin DOM): capas visibles en orden de apilado,
 * colores únicos en orden de primera aparición, validado contra el esquema
 * compartido del registro antes de devolverse.
 */
export function buildMockupManifest(payload: ExportRequestPayload): PngMockupManifest {
  const visibles = payload.layers.filter((l) => l.visible).sort((a, b) => a.orden - b.orden);
  if (visibles.length === 0) {
    throw new ExportFailure(
      makeProblem("validacion", {
        title: "Nada que componer",
        detail: "El proyecto no tiene capas visibles: el mockup PNG quedaría vacío.",
        errors: [{ code: "no_visible_layers", resource: "layers" }],
      }),
    );
  }
  const colors: string[] = [];
  const vistos = new Set<string>();
  for (const layer of visibles) {
    if (!vistos.has(layer.colorHex)) {
      vistos.add(layer.colorHex);
      colors.push(layer.colorHex);
    }
  }
  const manifest = {
    schemaVersion: 1 as const,
    projectId: payload.projectId,
    canvasSize: { width: payload.canvasSize.width, height: payload.canvasSize.height },
    layerCount: visibles.length,
    colors,
    source: payload.source,
  };
  const parsed = PngMockupManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new ExportFailure(
      makeProblem("interno", {
        title: "Manifest de mockup inválido",
        detail: `El manifest construido no supera PngMockupManifestSchema: ${parsed.error.issues
          .map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.code}`)
          .join("; ")}.`,
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "manifest",
          code: issue.code,
        })),
      }),
    );
  }
  return parsed.data;
}

/**
 * Composición completa del mockup: rasteriza cada capa visible (orden de
 * apilado ASC) sobre un canvas RGBA de `canvasSize` y extrae los bytes PNG.
 * `deps` por defecto = implementación real de navegador.
 */
export async function buildMockup(
  input: ExporterInput,
  deps: MockupDeps = createBrowserMockupDeps(),
  onProgress?: (phase: string, percent: number) => void,
): Promise<MockupExportResult> {
  const report = onProgress ?? (() => undefined);
  const { payload } = input;
  const manifest = buildMockupManifest(payload);
  const visibles = payload.layers.filter((l) => l.visible).sort((a, b) => a.orden - b.orden);

  const canvas = deps.createCanvas(payload.canvasSize.width, payload.canvasSize.height);
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new ExportFailure(
      makeProblem("interno", {
        title: "Contexto 2D no disponible",
        detail: "No se pudo obtener el contexto 2d del canvas del mockup.",
        errors: [{ code: "canvas_2d_unavailable" }],
      }),
    );
  }

  report("rasterizando", 5);
  for (let i = 0; i < visibles.length; i++) {
    const layer = visibles[i];
    // fill override por colorHex aplicado al sustituir el atributo del path.
    const { svg } = normalizeLayerSvg(layer.fragmentSvg, layer.colorHex);
    const img = await deps.loadImage(svg);
    img.draw(ctx);
    report("rasterizando", 5 + Math.round((90 * (i + 1)) / visibles.length));
  }

  report("serializando", 100);
  const blobBytes = await canvas.toBlob();
  const manifestJson = JSON.stringify(manifest, null, 2);
  return {
    fileName: `mockup-${payload.projectId}.png`,
    blobBytes,
    manifestJson,
    width: payload.canvasSize.width,
    height: payload.canvasSize.height,
  };
}

/** Entrada del ExporterRegistry (ADR-008) para el formato png-mockup. */
export const pngMockupExporter: Exporter = {
  id: "png-mockup",
  manifestSchemaVersion: appConfig.export.formats.find((f) => f.id === "png-mockup")?.manifestSchemaVersion ?? 1,
  build: (input: ExporterInput, ctx?: { onProgress?: (phase: string, percent: number) => void }) =>
    buildMockup(input, createBrowserMockupDeps(), ctx?.onProgress),
};
