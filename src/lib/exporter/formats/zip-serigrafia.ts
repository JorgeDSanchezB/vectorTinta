/**
 * VectorTinta — Formato `zip-serigrafia` (plan §3.3, ADR-002).
 *
 * CORRE EN EL WORKER (export.worker.ts): puro bytes y strings, sin DOM.
 * Entregable del taller: un SVG por tinta (con width/height reales para el
 * RIP), un manifest.json validado contra el esquema COMPARTIDO del registro
 * (ZipSerigrafiaManifestSchema) y el orden de impresión según la estrategia
 * de configuración (`appConfig.export.printOrderStrategy`), jamás hardcodeada.
 *
 * Nombres de archivo: `renderFilePattern`/`renderInkMark` de formats/manifests
 * rellenan las plantillas de `appConfig.export` (única fuente de patrones).
 */
import { appConfig } from "@/lib/config/app.config";
import { relativeLightness } from "@/lib/domain/invariants";
import { makeProblem } from "@/lib/domain/errors";
import { ZipSerigrafiaManifestSchema, renderFilePattern, renderInkMark } from "@/lib/registries/formats/manifests";
import { ExportFailure, type Exporter, type ExporterInput, type ExporterOutput } from "../types";
import { buildZip, type ZipFileEntry } from "../zip";
import { normalizeLayerSvg } from "../svg-fragment";

const encoder = new TextEncoder();

/** Redondeo determinista a 2 decimales (coincide con la serialización del manifest). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const zipSerigrafiaExporter: Exporter = {
  id: "zip-serigrafia",
  manifestSchemaVersion: 1,
  build(input: ExporterInput, ctx?: { onProgress?: (phase: string, percent: number) => void }): ExporterOutput {
    const report = ctx?.onProgress ?? (() => undefined);
    const { payload } = input;
    const strategy = appConfig.export.printOrderStrategy;

    const visibles = payload.layers.filter((l) => l.visible);
    const ocultas = payload.layers.filter((l) => !l.visible);
    if (visibles.length === 0) {
      throw new ExportFailure(
        makeProblem("validacion", {
          title: "Nada que exportar",
          detail: "El proyecto no tiene capas visibles: el ZIP serigráfico imprimiría cero tintas.",
          errors: [{ code: "no_visible_layers", resource: "layers" }],
        }),
      );
    }
    const areaTotal = payload.canvasSize.width * payload.canvasSize.height;
    if (!Number.isFinite(areaTotal) || areaTotal <= 0) {
      throw new ExportFailure(
        makeProblem("validacion", {
          title: "Tamaño de lienzo inválido",
          detail: `canvasSize ${payload.canvasSize.width}×${payload.canvasSize.height} no permite calcular coberturas.`,
          errors: [{ code: "invalid_canvas_size", field: "canvasSize" }],
        }),
      );
    }

    report("componiendo", 10);

    // Orden de impresión según la estrategia de configuración; empate → orden
    // de apilado (determinismo). 'by-area-desc' = tintas grandes primero;
    // 'by-lightness' = tintas claras primero (base de cobertura antes).
    const ordered = [...visibles].sort((a, b) => {
      if (strategy === "by-area-desc") {
        if (a.areaPx !== b.areaPx) return b.areaPx - a.areaPx;
      } else {
        const la = relativeLightness(a.colorHex);
        const lb = relativeLightness(b.colorHex);
        if (la !== lb) return la - lb;
      }
      return a.orden - b.orden;
    });

    const files: ZipFileEntry[] = [];
    const printOrder = ordered.map((layer, order) => {
      const { svg } = normalizeLayerSvg(layer.fragmentSvg, layer.colorHex);
      const fileName = renderFilePattern(order, layer.colorHex, layer.layerId);
      files.push({ name: fileName, bytes: encoder.encode(svg) });
      return {
        layerId: layer.layerId,
        order,
        fileName,
        colorHex: layer.colorHex,
        colorName: layer.name,
        inkMark: renderInkMark(order, layer.colorHex),
        areaPx: layer.areaPx,
        coveragePercent: round2((layer.areaPx / areaTotal) * 100),
        visible: true as const,
      };
    });

    report("serializando", 50);

    // El manifest se VALIDA contra el esquema del registro ANTES de
    // serializar: jamás se sube un manifest inválido.
    const manifest = {
      schemaVersion: 1 as const,
      projectId: payload.projectId,
      printOrder,
      strategy,
      source: payload.source,
      excludedLayers: ocultas.map((l) => ({ layerId: l.layerId, reason: "oculta por el usuario" })),
      patternInfo: {
        filePattern: appConfig.export.filePattern,
        inkMarkPattern: appConfig.export.inkMarkPattern,
      },
    };
    const parsed = ZipSerigrafiaManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      throw new ExportFailure(
        makeProblem("interno", {
          title: "Manifest de exportación inválido",
          detail: `El manifest construido no supera ZipSerigrafiaManifestSchema: ${parsed.error.issues
            .map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.code}`)
            .join("; ")}.`,
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.map(String).join(".") || "manifest",
            code: issue.code,
          })),
        }),
      );
    }
    const manifestJson = JSON.stringify(parsed.data, null, 2);
    files.push({ name: appConfig.export.manifestFileName, bytes: encoder.encode(manifestJson) });

    report("comprimiendo", 80);
    const blobBytes = buildZip(files);
    report("comprimiendo", 100);

    return { fileName: `vectortinta-${payload.projectId}.zip`, blobBytes, manifestJson };
  },
};
