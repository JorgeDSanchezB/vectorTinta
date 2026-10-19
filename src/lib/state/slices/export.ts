/**
 * VectorTinta — Slice de exportación (plan §3.3 exports + §5.5).
 *
 * zip-serigrafia → export.worker (fflate, bytes puros).
 * png-mockup → hilo principal (rasteriza SVG con <img>/canvas; ADR-012).
 * Ambos: descarga local inmediata + registro persistente (multipart con
 * manifest validado contra el esquema del ExporterRegistry y checksum sha-256).
 */
"use client";

import type { StateCreator } from "zustand";
import { api, sha256Hex } from "@/lib/api-client";
import { appConfig } from "@/lib/config/app.config";
import { ApiProblem } from "@/lib/domain/errors";
import type { ExportDto } from "@/lib/domain/entities";
import type { ExportLayerInput, ExportRequestPayload } from "@/lib/domain/worker-protocol";
import { runZipExportJob, JobCancelled } from "@/lib/state/slices/worker-hosts";
import { buildMockup } from "@/lib/exporter/formats/png-mockup";
import { toast } from "sonner";
import { claseDeError } from "@/lib/state/slices/auth";
import type { Store } from "@/lib/state/store";

export type ExportStatus = "idle" | "building" | "uploading" | "done" | "error";

export interface ExportSlice {
  exportStatus: ExportStatus;
  exportPhase: string;
  exportPercent: number;
  exportFormatId: string | null;
  exportProblem: string | null;
  lastExport: ExportDto | null;
  lastLocalDownload: { url: string; fileName: string } | null;
  recentExports: ExportDto[];

  runExport(formatId: "zip-serigrafia" | "png-mockup"): Promise<void>;
  loadRecentExports(): Promise<void>;
}

/** Descarga un blob como archivo (ancla temporal). */
function downloadBlob(bytes: Uint8Array, fileName: string, mime: string): { url: string; fileName: string } {
  const copy = new Uint8Array(bytes); // el buffer del worker puede ser transferido
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  return { url, fileName };
}

export const createExportSlice: StateCreator<Store, [], [], ExportSlice> = (set, get) => ({
  exportStatus: "idle",
  exportPhase: "",
  exportPercent: 0,
  exportFormatId: null,
  exportProblem: null,
  lastExport: null,
  lastLocalDownload: null,
  recentExports: [],

  async runExport(formatId) {
    const project = get().project;
    const source = get().source;
    const vectorization = get().vectorization;
    if (project === null || vectorization === null) return;
    if (get().exportStatus === "building" || get().exportStatus === "uploading") return;

    const layers: ExportLayerInput[] = get().layers.map((l) => ({
      layerId: l.id,
      orden: l.orden,
      colorHex: l.colorHex,
      name: l.name,
      areaPx: l.areaPx,
      visible: l.visible,
      fragmentSvg: l.fragmentSvg,
    }));
    const payload: ExportRequestPayload = {
      formatId,
      projectId: project.id,
      layers,
      canvasSize: {
        width: source?.width ?? 1024,
        height: source?.height ?? 1024,
      },
      source: {
        presetId: vectorization.presetId,
        engineId: vectorization.engineId,
        assetId: get().source?.assetId ?? "desconocido",
      },
    };

    set({ exportStatus: "building", exportPercent: 1, exportPhase: "preparando", exportFormatId: formatId, exportProblem: null, lastLocalDownload: null });
    try {
      const mime = formatId === "zip-serigrafia" ? "application/zip" : "image/png";
      const result =
        formatId === "zip-serigrafia"
          ? await runZipExportJob(
              payload,
              {
                onProgress: (phase, percent) => set({ exportPhase: phase, exportPercent: percent }),
              },
              (reason) =>
                get().pushDiagnostic({
                  clase: "local",
                  title: "ZIP en modo compatibilidad (hilo principal)",
                  detail: reason,
                }),
            )
          : await buildMockup({ payload }, undefined, (phase, percent) => set({ exportPhase: phase, exportPercent: percent }));

      // descarga local inmediata
      const local = downloadBlob(result.blobBytes, result.fileName, mime);
      set({ lastLocalDownload: local, exportStatus: "uploading", exportPhase: "registrando", exportPercent: 99 });

      // registro persistente (multipart + checksum, S-06)
      const checksum = await sha256Hex(result.blobBytes as unknown as ArrayBuffer);
      const file = new File([new Uint8Array(result.blobBytes)], result.fileName, { type: mime });
      const registered = await api.exports.register(project.id, {
        file,
        fileName: result.fileName,
        formatId,
        manifestJson: result.manifestJson,
        checksum,
      });
      set({
        exportStatus: "done",
        exportPercent: 100,
        exportPhase: "",
        lastExport: registered,
        recentExports: [registered, ...get().recentExports].slice(0, appConfig.pagination.defaultLimit),
      });
      toast.success("Exportación lista", {
        description: `${result.fileName} descargado y registrado en el proyecto`,
      });
    } catch (e) {
      if (e instanceof JobCancelled) {
        set({ exportStatus: "idle", exportPhase: "", exportPercent: 0 });
        toast.info("Exportación cancelada");
        return;
      }
      const problem = e instanceof ApiProblem ? e.problem : null;
      set({
        exportStatus: "error",
        exportProblem: problem?.detail ?? problem?.title ?? "Fallo desconocido",
        exportPhase: "",
      });
      get().pushDiagnostic({
        clase: claseDeError(e),
        title: "La exportación falló",
        detail: problem?.detail,
        action: "Reintentar",
      });
      toast.error("No se pudo exportar", { description: problem?.detail });
    }
  },

  async loadRecentExports() {
    const project = get().project;
    if (project === null) return;
    try {
      const page = await api.exports.list(project.id, { limit: 8 });
      set({ recentExports: page.items });
    } catch {
      /* listado decorativo: no bloquea */
    }
  },
});
