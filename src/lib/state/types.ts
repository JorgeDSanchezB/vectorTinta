/**
 * VectorTinta — Tipos del estado del cliente (ADR-004: Zustand + slices).
 *
 * `ClientLayer` es el ESPEJO local de `LayerDto` + el `fragmentSvg` en cadena
 * (cacheado al abrir el proyecto): el VectorStage inlinea el fragmento UNA
 * vez por cambio estructural y aplica recolor/visibilidad/orden por MUTACIÓN
 * DIRECTA del DOM (presupuesto <16 ms del plan §5.3), sin re-render de React.
 */
import type { RawImageData } from "@/lib/domain/entities";

export interface ClientLayer {
  id: string;
  vectorizationId: string;
  orden: number;
  colorHex: string;
  name: string;
  areaPx: number;
  visible: boolean;
  /** Fragmento SVG tal como se almacenó (fill original); el color ACTUAL vive en colorHex. */
  fragmentSvg: string;
  /** URL firmada por si hace falta re-descargar el fragmento. */
  svgFragmentUrl: string;
  createdAt: string;
}

/** Estado de la imagen fuente en el espacio de trabajo (todo cliente, ADR-009). */
export interface SourceImageState {
  assetId: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  checksum: string;
  /** Bitmap para vista rápida del panel (opcional si solo hay píxeles). */
  bitmap: ImageBitmap | null;
  /** Píxeles ACTUALES (post eliminación de fondo). */
  imageData: RawImageData;
  /** ¿Se ha modificado el alfa localmente? (chip informativo; no persistido). */
  bgApplied: boolean;
}

/** Comando serializable de undo/redo (plan §5.6, límite en configuración). */
export interface HistoryCommand {
  label: string;
  at: number;
  apply: () => Promise<void> | void;
  revert: () => Promise<void> | void;
}

/** Entrada del registro de diagnóstico (failure-modes.md). */
export interface DiagnosticEntry {
  id: string;
  at: number;
  clase: string; // Problema RFC 7807 o 'local'
  title: string;
  detail?: string;
  action?: string; // acción sugerida
}
