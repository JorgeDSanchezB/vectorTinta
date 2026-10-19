/**
 * VectorTinta — Normalización de fragmentos SVG de capa (compartida por los
 * dos formatos de exportación).
 *
 * El `fragmentSvg` de una capa es un documento SVG de un solo color (contrato
 * de `LayerDraft.fragmentSvg`). Para exportar:
 *  1. Se RECONSTRUYE la cabecera garantizando xmlns + viewBox + width/height
 *     en píxeles reales del viewBox (para que un RIP o un visor externo abra
 *     el archivo suelto con el tamaño físico correcto).
 *  2. Se aplica OVERRIDE de `fill` con el `colorHex` ACTUAL de la capa: el
 *     color manifiesto en el manifest y el color pintado en el archivo no
 *     pueden divergir si el usuario recoloreó la capa tras vectorizar
 *     (coherencia manifest ↔ archivo; el mockup PNG exige lo mismo).
 *
 * Es manipulación de strings pura y determinista (los fragmentos tienen un
 * solo elemento `path` por contrato; no hay DOM aquí: debe correr en Worker).
 */
import { makeProblem } from "@/lib/domain/errors";
import { ExportFailure } from "./types";

export interface NormalizedLayerSvg {
  svg: string;
  width: number;
  height: number;
}

/** Reconstruye el fragmentSvg con viewBox+width/height y fill=colorHex. */
export function normalizeLayerSvg(fragmentSvg: string, colorHex: string): NormalizedLayerSvg {
  const viewBoxMatch = /viewBox\s*=\s*"([^"]+)"/.exec(fragmentSvg);
  if (viewBoxMatch === null) {
    throw new ExportFailure(
      makeProblem("interno", {
        title: "Fragmento SVG sin viewBox",
        detail: "El fragmentSvg de la capa no declara viewBox; no se puede determinar el tamaño físico de exportación.",
        errors: [{ code: "missing_view_box", field: "fragmentSvg" }],
      }),
    );
  }
  const partes = viewBoxMatch[1].trim().split(/\s+/);
  if (partes.length !== 4) {
    throw new ExportFailure(
      makeProblem("interno", {
        title: "Fragmento SVG con viewBox malformado",
        detail: `viewBox="${viewBoxMatch[1]}" no tiene los 4 números esperados (minX minY width height).`,
        errors: [{ code: "malformed_view_box", field: "fragmentSvg" }],
      }),
    );
  }
  const width = Number(partes[2]);
  const height = Number(partes[3]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ExportFailure(
      makeProblem("interno", {
        title: "Fragmento SVG con tamaño inválido",
        detail: `viewBox="${viewBoxMatch[1]}" produce width/height no positivos.`,
        errors: [{ code: "invalid_view_box_size", field: "fragmentSvg" }],
      }),
    );
  }

  const openEnd = fragmentSvg.indexOf(">");
  const closeAt = fragmentSvg.lastIndexOf("</svg>");
  if (!fragmentSvg.startsWith("<svg") || openEnd === -1 || closeAt === -1) {
    throw new ExportFailure(
      makeProblem("interno", {
        title: "Fragmento SVG malformado",
        detail: "El fragmentSvg de la capa no es un documento <svg>…</svg> completo.",
        errors: [{ code: "malformed_fragment_svg", field: "fragmentSvg" }],
      }),
    );
  }
  let inner = fragmentSvg.slice(openEnd + 1, closeAt);
  // Override de fill: quitar cualquier fill previo y fijar el colorHex actual.
  inner = inner.replace(/\sfill\s*=\s*"[^"]*"/g, "");
  inner = inner.replace(/<path\b/g, `<path fill="${colorHex}"`);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${partes[0]} ${partes[1]} ${partes[2]} ${partes[3]}"` +
    ` width="${partes[2]}" height="${partes[3]}">${inner}</svg>`;
  return { svg, width, height };
}
