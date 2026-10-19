/**
 * VectorTinta — Slice del proyecto (plan §5.2/§5.6, ADR-004).
 *
 * Espejo local + edición optimista: cada acción confirmada aplica LOCAL
 * primero (lienzo instantáneo, <16 ms) y persiste con PATCH/POST después;
 * si el servidor rechaza, se revierte el espejo y el fallo va al registro
 * de diagnóstico (nunca se "arregla" en silencio).
 *
 * La persistencia usa EXCLUSIVAMENTE los endpoints del catálogo §3.2.
 */
"use client";

import type { StateCreator } from "zustand";
import { api, decodeImageFile, sha256Hex } from "@/lib/api-client";
import { appConfig } from "@/lib/config/app.config";
import { ApiProblem } from "@/lib/domain/errors";
import type { Problem } from "@/lib/domain/errors";
import type { AssetDto, LayerDto, ProjectDto, ProjectListItemDto, VectorizationDto, VectorParams, RawImageData } from "@/lib/domain/entities";
import { isAllowedImageMime, withinMaxDimension, withinMaxUploadBytes } from "@/lib/domain/invariants";
import { toast } from "sonner";
import type { BgRemovalOptions } from "@/lib/domain/worker-protocol";
import { JobCancelled, runBgRemovalJob, runVectorizeJob } from "@/lib/state/slices/worker-hosts";
import type { ClientLayer, HistoryCommand, SourceImageState } from "@/lib/state/types";
import type { Store } from "@/lib/state/store";
import { claseDeError, writeDraft } from "@/lib/state/slices/auth";

const L = appConfig.limits;

export type PanelStatus = "empty" | "loading" | "ready" | "error" | "partial";

export interface ProjectSlice {
  /* listado de proyectos (cursor, ADR-010) */
  projects: ProjectListItemDto[];
  projectsCursor: string | null;
  projectsHasMore: boolean;
  projectsLoading: boolean;
  projectsError: Problem | null;
  loadProjects(opts?: { reset?: boolean }): Promise<void>;

  /* espacio de trabajo */
  project: ProjectDto | null;
  workspaceStatus: PanelStatus;
  workspaceProblem: Problem | null;
  assets: AssetDto[];
  vectorization: VectorizationDto | null;
  layers: ClientLayer[];
  /** bump estructural: el VectorStage re-inlinea fragmentos SOLO cuando cambia. */
  layersVersion: number;
  source: SourceImageState | null;
  sourceStatus: PanelStatus;
  sourceProblem: Problem | null;
  hasAlpha: boolean;

  vectorizeBusy: boolean;
  vectorizePhase: string;
  vectorizePercent: number;
  bgBusy: boolean;
  bgPhase: string;
  bgPercent: number;

  openProject(id: string, opts?: { fromDraft?: boolean }): Promise<void>;
  createProject(name: string, description?: string | null): Promise<void>;
  closeProject(): void;
  deleteProject(id: string): Promise<void>;
  renameProject(name: string): Promise<void>;
  uploadSource(blob: Blob, fileName: string, mimeType: string): Promise<void>;
  runBgRemoval(engineId: string, options: BgRemovalOptions): Promise<void>;
  runVectorization(presetId: string, params: VectorParams, engineId: string): Promise<void>;
  recolorLayer(layerId: string, colorHex: string, opts?: { name?: string }): Promise<void>;
  renameLayer(layerId: string, name: string): Promise<void>;
  toggleVisible(layerId: string, visible: boolean): Promise<void>;
  duplicateLayer(layerId: string): Promise<void>;
  reorderLayer(activeId: string, overId: string): Promise<void>;
}

/** Extrae el innerHTML del fragmento `<svg…>INNER</svg>` (inlineable en un <g>). */
export function fragmentInner(fragmentSvg: string): string {
  const openEnd = fragmentSvg.indexOf(">");
  const closeAt = fragmentSvg.lastIndexOf("</svg>");
  if (!fragmentSvg.startsWith("<svg") || openEnd === -1 || closeAt === -1) return "";
  return fragmentSvg.slice(openEnd + 1, closeAt);
}

/** Detecta si la imagen tiene alfa significativo (para el tablero de transparencia). */
function scanAlpha(imageData: RawImageData): boolean {
  const d = imageData.data;
  for (let i = 3; i < d.length; i += 4 * 7) {
    if (d[i] < 255) return true; // muestreo determinista: basta un píxel
  }
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 255) return true;
  }
  return false;
}

interface OrdenTarget {
  layerId: string;
  orden: number;
}

/** Planifica la secuencia de intercambios (PATCH {orden}) hasta el objetivo. */
function planSwapSequence(current: OrdenTarget[], target: OrdenTarget[]): { layerId: string; orden: number }[] {
  const sim = new Map(current.map((t) => [t.layerId, t.orden]));
  const patches: { layerId: string; orden: number }[] = [];
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const mismatch = target.find((t) => sim.get(t.layerId) !== t.orden);
    if (mismatch === undefined) break;
    const oldOrden = sim.get(mismatch.layerId) as number;
    let occupant: string | null = null;
    for (const [id, orden] of sim) {
      if (id !== mismatch.layerId && orden === mismatch.orden) {
        occupant = id;
        break;
      }
    }
    patches.push({ layerId: mismatch.layerId, orden: mismatch.orden });
    sim.set(mismatch.layerId, mismatch.orden);
    if (occupant !== null) sim.set(occupant, oldOrden);
  }
  return patches;
}

export const createProjectSlice: StateCreator<Store, [], [], ProjectSlice> = (set, get) => ({
  projects: [],
  projectsCursor: null,
  projectsHasMore: false,
  projectsLoading: false,
  projectsError: null,

  project: null,
  workspaceStatus: "empty",
  workspaceProblem: null,
  assets: [],
  vectorization: null,
  layers: [],
  layersVersion: 0,
  source: null,
  sourceStatus: "empty",
  sourceProblem: null,
  hasAlpha: false,

  vectorizeBusy: false,
  vectorizePhase: "",
  vectorizePercent: 0,
  bgBusy: false,
  bgPhase: "",
  bgPercent: 0,

  async loadProjects(opts) {
    const reset = opts?.reset ?? false;
    if (get().projectsLoading) return;
    const cursor = reset ? undefined : get().projectsCursor ?? undefined;
    if (!reset && cursor === undefined && get().projects.length > 0) return;
    set({ projectsLoading: true, projectsError: reset ? null : get().projectsError });
    try {
      const page = await api.projects.list({ limit: appConfig.pagination.defaultLimit, cursor });
      set({
        projects: reset ? page.items : [...get().projects, ...page.items],
        projectsCursor: page.nextCursor,
        projectsHasMore: page.hasMore,
        projectsLoading: false,
        projectsError: null,
      });
    } catch (e) {
      const problem = e instanceof ApiProblem ? e.problem : null;
      set({ projectsLoading: false, projectsError: problem });
      get().pushDiagnostic({
        clase: claseDeError(e),
        title: "No se pudo cargar la lista de proyectos",
        detail: problem?.detail,
        action: "Reintentar",
      });
    }
  },

  async openProject(id, opts) {
    set({
      workspaceStatus: "loading",
      workspaceProblem: null,
      layers: [],
      vectorization: null,
      assets: [],
      source: null,
      sourceStatus: "empty",
      hasAlpha: false,
    });
    try {
      const ws = await api.projects.get(id);
      // fragmentos en paralelo (URLs firmadas)
      const layers: ClientLayer[] = await Promise.all(
        ws.layers.map(async (dto: LayerDto): Promise<ClientLayer> => {
          try {
            const blob = await api.fetchAssetBlob(dto.svgFragmentUrl);
            return { ...dto, fragmentSvg: await blob.text() };
          } catch {
            get().pushDiagnostic({
              clase: "temporal",
              title: `No se pudo descargar el fragmento de la capa ${dto.orden}`,
              detail: "La capa se muestra vacía; reintenta abriendo el proyecto.",
              action: "Reabrir el proyecto",
            });
            return { ...dto, fragmentSvg: "" };
          }
        }),
      );

      let source: SourceImageState | null = null;
      let hasAlpha = false;
      const sourceAsset = ws.assets.find((a) => a.role === "source") ?? null;
      if (sourceAsset !== null) {
        set({ sourceStatus: "loading" });
        try {
          const blob = await api.fetchAssetBlob(sourceAsset.downloadUrl);
          const decoded = await decodeImageFile(new Blob([blob], { type: sourceAsset.mimeType }));
          hasAlpha = scanAlpha(decoded.imageData);
          source = {
            assetId: sourceAsset.id,
            mimeType: sourceAsset.mimeType,
            width: decoded.width,
            height: decoded.height,
            bytes: sourceAsset.bytes,
            checksum: sourceAsset.checksum,
            bitmap: decoded.bitmap,
            imageData: decoded.imageData,
            bgApplied: false,
          };
        } catch (e) {
          get().pushDiagnostic({
            clase: "temporal",
            title: "No se pudo descargar la imagen fuente",
            detail: e instanceof Error ? e.message : undefined,
            action: "Reabrir el proyecto",
          });
        }
      }

      set({
        project: ws.project,
        assets: ws.assets,
        vectorization: ws.vectorization,
        layers,
        layersVersion: get().layersVersion + 1,
        source,
        sourceStatus: source !== null ? "ready" : "empty",
        hasAlpha,
        workspaceStatus: layers.some((l) => l.fragmentSvg === "") ? "partial" : "ready",
        workspaceProblem: null,
      });
      writeDraft(id);
      get().resetHistory();
      get().setView("editar");
    } catch (e) {
      const problem = e instanceof ApiProblem ? e.problem : null;
      set({
        workspaceStatus: "error",
        workspaceProblem: problem,
        layers: [],
        project: null,
      });
      if (!opts?.fromDraft) {
        get().pushDiagnostic({
          clase: claseDeError(e),
          title: "No se pudo abrir el proyecto",
          detail: problem?.detail,
        });
      }
    }
  },

  async createProject(name, description) {
    const project = await api.projects.create({ name, description: description ?? null });
    set({ projects: [project as unknown as ProjectListItemDto, ...get().projects] });
    await get().openProject(project.id);
  },

  closeProject() {
    writeDraft(null);
    set({
      project: null,
      workspaceStatus: "empty",
      assets: [],
      vectorization: null,
      layers: [],
      source: null,
      sourceStatus: "empty",
      hasAlpha: false,
    });
    get().resetHistory();
  },

  async deleteProject(id) {
    await api.projects.remove(id);
    const wasCurrent = get().project?.id === id;
    set({ projects: get().projects.filter((p) => p.id !== id) });
    if (wasCurrent) get().closeProject();
    toast.success("Proyecto eliminado");
  },

  async renameProject(name) {
    const current = get().project;
    if (current === null) return;
    set({ project: { ...current, name } });
    try {
      await api.projects.patch(current.id, { name });
    } catch (e) {
      set({ project: current });
      const problem = e instanceof ApiProblem ? e.problem : null;
      get().pushDiagnostic({ clase: claseDeError(e), title: "No se pudo renombrar", detail: problem?.detail });
      toast.error("No se pudo renombrar el proyecto");
    }
  },

  async uploadSource(blob, fileName, mimeType) {
    const project = get().project;
    if (project === null) return;

    if (!isAllowedImageMime(mimeType)) {
      toast.error(`Formato no permitido. Usa: ${appConfig.limits.image.allowedMimeTypes.join(", ")}`);
      return;
    }
    if (!withinMaxUploadBytes(blob.size)) {
      toast.error(`El archivo supera ${Math.round(L.image.maxUploadBytes / 1048576)} MiB (límite de configuración).`);
      return;
    }
    set({ sourceStatus: "loading", sourceProblem: null });
    try {
      const decoded = await decodeImageFile(blob);
      if (!withinMaxDimension(decoded.width, decoded.height)) {
        set({ sourceStatus: "error" });
        toast.error(`Dimensiones ${decoded.width}×${decoded.height} superan el máximo ${L.image.maxDimension}px por lado.`);
        return;
      }
      const checksum = await sha256Hex(await blob.arrayBuffer());
      const asset = await api.assets.upload(project.id, {
        file: new File([blob], fileName, { type: mimeType }),
        role: "source",
        width: decoded.width,
        height: decoded.height,
        checksum,
      });
      set({
        assets: [...get().assets, asset],
        source: {
          assetId: asset.id,
          mimeType: asset.mimeType,
          width: decoded.width,
          height: decoded.height,
          bytes: asset.bytes,
          checksum: asset.checksum,
          bitmap: decoded.bitmap,
          imageData: decoded.imageData,
          bgApplied: false,
        },
        sourceStatus: "ready",
        hasAlpha: scanAlpha(decoded.imageData),
      });
      toast.success("Imagen fuente lista", { description: `${decoded.width}×${decoded.height} · ${Math.round(blob.size / 1024)} KiB` });
    } catch (e) {
      const problem = e instanceof ApiProblem ? e.problem : null;
      set({ sourceStatus: "error", sourceProblem: problem });
      get().pushDiagnostic({ clase: claseDeError(e), title: "La subida falló", detail: problem?.detail, action: "Reintentar" });
      toast.error("No se pudo subir la imagen", { description: problem?.detail });
    }
  },

  async runBgRemoval(engineId, options) {
    const source = get().source;
    if (source === null || get().bgBusy) return;
    set({ bgBusy: true, bgPhase: "preparando", bgPercent: 1 });
    try {
      const result = await runBgRemovalJob(
        { imageData: source.imageData, options, engineId },
        {
          onProgress: (phase, percent) => set({ bgPhase: phase, bgPercent: percent }),
        },
        (reason) =>
          get().pushDiagnostic({
            clase: "local",
            title: "Fondo en modo compatibilidad (hilo principal)",
            detail: `El Worker no está disponible: ${reason}. La operación funciona sin bloquear el flujo.`,
          }),
      );
      const after: RawImageData = {
        width: result.alphaMask.width,
        height: result.alphaMask.height,
        data: new Uint8ClampedArray(source.imageData.data), // copia: conserva los RGB originales
      };
      for (let i = 3; i < after.data.length; i += 4) {
        after.data[i] = result.alphaMask.data[i];
      }
      const before = source.imageData;
      const next: SourceImageState = { ...source, imageData: after, bgApplied: true };
      set({
        source: next,
        hasAlpha: true,
        bgBusy: false,
        bgPhase: "",
        bgPercent: 100,
      });
      const pct = Math.round((result.removedPx / result.totalPx) * 1000) / 10;
      const cmd: HistoryCommand = {
        label: "Quitar fondo",
        at: Date.now(),
        revert: () => set({ source: { ...get().source!, imageData: before, bgApplied: false } }),
        apply: () => set({ source: { ...get().source!, imageData: after, bgApplied: true } }),
      };
      get().pushHistory(cmd);
      toast.success("Fondo eliminado (reversible)", { description: `${pct} % de la imagen pasó a transparente` });
    } catch (e) {
      set({ bgBusy: false, bgPhase: "", bgPercent: 0 });
      if (e instanceof JobCancelled) {
        toast.info("Operación cancelada");
        return;
      }
      const problem = e instanceof ApiProblem ? e.problem : null;
      get().pushDiagnostic({
        clase: claseDeError(e),
        title: "La eliminación de fondo falló",
        detail: problem?.detail,
        action: "Reintentar con otra tolerancia",
      });
      toast.error("No se pudo quitar el fondo", { description: problem?.detail });
    }
  },

  async runVectorization(presetId, params, engineId) {
    const source = get().source;
    const project = get().project;
    if (source === null || project === null || get().vectorizeBusy) return;
    set({ vectorizeBusy: true, vectorizePhase: "preparando", vectorizePercent: 1 });
    try {
      const result = await runVectorizeJob(
        { imageData: source.imageData, params, engineId },
        {
          onProgress: (phase, percent) => set({ vectorizePhase: phase, vectorizePercent: percent }),
        },
        (reason) =>
          get().pushDiagnostic({
            clase: "local",
            title: "Vectorización en modo compatibilidad (hilo principal)",
            detail: `El Worker no está disponible: ${reason}.`,
          }),
      );

      const persistido = await api.vectorize.run(project.id, {
        presetId,
        engineId,
        sourceAssetId: source.assetId,
        params,
        svg: result.svg,
        layers: result.layers.map((l) => ({
          orden: l.orden,
          colorHex: l.colorHex,
          name: l.name,
          areaPx: l.areaPx,
          fragmentSvg: l.fragmentSvg,
        })),
      });

      const prevSnapshot = {
        vectorization: get().vectorization,
        layers: get().layers,
      };
      const clientLayers: ClientLayer[] = persistido.layers.map((dto) => ({
        id: dto.id,
        vectorizationId: dto.vectorizationId,
        orden: dto.orden,
        colorHex: dto.colorHex,
        name: dto.name,
        areaPx: dto.areaPx,
        visible: dto.visible,
        fragmentSvg: result.layers.find((d) => d.orden === dto.orden)?.fragmentSvg ?? "",
        svgFragmentUrl: dto.svgFragmentUrl,
        createdAt: dto.createdAt,
      }));

      set({
        vectorization: persistido.vectorization,
        layers: clientLayers,
        layersVersion: get().layersVersion + 1,
        vectorizeBusy: false,
        vectorizePhase: "",
        vectorizePercent: 100,
        workspaceStatus: "ready",
      });

      const newSnapshot = { vectorization: persistido.vectorization, layers: clientLayers };
      const cmd: HistoryCommand = {
        label: "Vectorizar",
        at: Date.now(),
        revert: () => set({ ...prevSnapshot, layersVersion: get().layersVersion + 1 }),
        apply: () => set({ ...newSnapshot, layersVersion: get().layersVersion + 1 }),
      };
      get().pushHistory(cmd);
      toast.success("Vectorización lista", {
        description: `${persistido.vectorization.nodeCount} nodos · ${persistido.layers.length} capas · preset ${presetId}`,
      });
      void uploadThumbnailBestEffort(project.id, result.svg);
    } catch (e) {
      set({ vectorizeBusy: false, vectorizePhase: "", vectorizePercent: 0 });
      if (e instanceof JobCancelled) {
        toast.info("Vectorización cancelada");
        return;
      }
      const problem = e instanceof ApiProblem ? e.problem : null;
      get().pushDiagnostic({
        clase: claseDeError(e),
        title: "La vectorización falló",
        detail: problem?.detail,
      });
      toast.error("No se pudo vectorizar", { description: problem?.detail });
    }
  },

  async recolorLayer(layerId, colorHex, opts) {
    const project = get().project;
    const layer = get().layers.find((l) => l.id === layerId);
    if (project === null || layer === undefined) return;
    const before = { colorHex: layer.colorHex, name: layer.name };
    const next = { colorHex, ...(opts?.name !== undefined ? { name: opts.name } : {}) };
    const patchTo = async (v: { colorHex: string; name?: string }): Promise<void> => {
      await api.layers.patch(project.id, layerId, v);
    };
    set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, ...next } : l)) });
    const apply = async (): Promise<void> => {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, ...next } : l)) });
      await patchTo(next);
    };
    const revert = async (): Promise<void> => {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, ...before } : l)) });
      await patchTo(before);
    };
    // UNA acción de usuario = UN comando del historial (color y nombre juntos).
    get().pushHistory({ label: opts?.name !== undefined ? "Recolorear tinta" : "Recolorear capa", at: Date.now(), apply, revert });
    try {
      await patchTo(next);
    } catch (e) {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, ...before } : l)) });
      const problem = e instanceof ApiProblem ? e.problem : null;
      get().pushDiagnostic({ clase: claseDeError(e), title: "No se pudo recolorear", detail: problem?.detail });
      toast.error("No se pudo recolorear la capa", { description: problem?.detail });
    }
  },

  async renameLayer(layerId, name) {
    const project = get().project;
    const layer = get().layers.find((l) => l.id === layerId);
    if (project === null || layer === undefined) return;
    const before = layer.name;
    set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, name } : l)) });
    const apply = async (): Promise<void> => {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, name } : l)) });
      await api.layers.patch(project.id, layerId, { name });
    };
    const revert = async (): Promise<void> => {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, name: before } : l)) });
      await api.layers.patch(project.id, layerId, { name: before });
    };
    get().pushHistory({ label: "Renombrar capa", at: Date.now(), apply, revert });
    try {
      await api.layers.patch(project.id, layerId, { name });
    } catch (e) {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, name: before } : l)) });
      toast.error("No se pudo renombrar la capa");
    }
  },

  async toggleVisible(layerId, visible) {
    const project = get().project;
    const layer = get().layers.find((l) => l.id === layerId);
    if (project === null || layer === undefined) return;
    const before = layer.visible;
    set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, visible } : l)) });
    const apply = async (): Promise<void> => {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, visible } : l)) });
      await api.layers.patch(project.id, layerId, { visible });
    };
    const revert = async (): Promise<void> => {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, visible: before } : l)) });
      await api.layers.patch(project.id, layerId, { visible: before });
    };
    get().pushHistory({ label: visible ? "Mostrar capa" : "Ocultar capa", at: Date.now(), apply, revert });
    try {
      await api.layers.patch(project.id, layerId, { visible });
    } catch (e) {
      set({ layers: get().layers.map((l) => (l.id === layerId ? { ...l, visible: before } : l)) });
      toast.error("No se pudo cambiar la visibilidad");
    }
  },

  async duplicateLayer(layerId) {
    const project = get().project;
    const layer = get().layers.find((l) => l.id === layerId);
    if (project === null || layer === undefined) return;
    try {
      const dto = await api.layers.duplicate(project.id, { sourceLayerId: layerId });
      set({
        layers: [
          ...get().layers,
          {
            id: dto.id,
            vectorizationId: dto.vectorizationId,
            orden: dto.orden,
            colorHex: dto.colorHex,
            name: dto.name,
            areaPx: dto.areaPx,
            visible: dto.visible,
            fragmentSvg: layer.fragmentSvg, // contenido idéntico al original
            svgFragmentUrl: dto.svgFragmentUrl,
            createdAt: dto.createdAt,
          },
        ],
        layersVersion: get().layersVersion + 1,
      });
      toast.success("Capa duplicada", { description: dto.name });
    } catch (e) {
      const problem = e instanceof ApiProblem ? e.problem : null;
      toast.error("No se pudo duplicar la capa", { description: problem?.detail });
    }
  },

  async reorderLayer(activeId, overId) {
    const project = get().project;
    if (project === null || activeId === overId) return;
    const sorted = [...get().layers].sort((a, b) => a.orden - b.orden);
    const from = sorted.findIndex((l) => l.id === activeId);
    const to = sorted.findIndex((l) => l.id === overId);
    if (from === -1 || to === -1) return;
    const moved = sorted.splice(from, 1)[0];
    sorted.splice(to, 0, moved);
    const target: OrdenTarget[] = sorted.map((l, index) => ({ layerId: l.id, orden: index }));

    const before: OrdenTarget[] = [...get().layers].map((l) => ({ layerId: l.id, orden: l.orden }));
    // espejo local inmediato (lienzo)
    set({ layers: get().layers.map((l) => ({ ...l, orden: target.find((t) => t.layerId === l.id)!.orden })) });
    const simulateAndSend = async (from: OrdenTarget[], to: OrdenTarget[]): Promise<void> => {
      const patches = planSwapSequence(from, to);
      for (const patch of patches) {
        await api.layers.patch(project.id, patch.layerId, { orden: patch.orden });
      }
    };

    const apply = async (): Promise<void> => {
      set({ layers: get().layers.map((l) => ({ ...l, orden: before.find((t) => t.layerId === l.id)!.orden })) });
      set({ layers: get().layers.map((l) => ({ ...l, orden: target.find((t) => t.layerId === l.id)!.orden })) });
      await simulateAndSend(before, target);
    };
    const revert = async (): Promise<void> => {
      set({ layers: get().layers.map((l) => ({ ...l, orden: target.find((t) => t.layerId === l.id)!.orden })) });
      set({ layers: get().layers.map((l) => ({ ...l, orden: before.find((t) => t.layerId === l.id)!.orden })) });
      await simulateAndSend(target, before);
    };

    get().pushHistory({ label: "Reordenar capas", at: Date.now(), apply, revert });
    try {
      await simulateAndSend(before, target);
    } catch (e) {
      const problem = e instanceof ApiProblem ? e.problem : null;
      get().pushDiagnostic({ clase: claseDeError(e), title: "No se pudo reordenar", detail: problem?.detail });
      toast.error("No se pudo reordenar la capa");
      // re-sincroniza con el servidor tras el fallo
      void get().openProject(project.id, { fromDraft: true });
    }
  },
});

/* ─────────── Miniatura (best-effort, no bloquea el flujo) ─────────── */

async function uploadThumbnailBestEffort(projectId: string, svg: string): Promise<void> {
  try {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      const scale = 256 / Math.max(img.naturalWidth, img.naturalHeight);
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (ctx === null) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (pngBlob === null) return;
      const checksum = await sha256Hex(await pngBlob.arrayBuffer());
      const asset = await api.assets.upload(projectId, {
        file: new File([pngBlob], "thumb.png", { type: "image/png" }),
        role: "thumbnail",
        width: canvas.width,
        height: canvas.height,
        checksum,
      });
      await api.projects.patch(projectId, { thumbnailAssetId: asset.id });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    /* la miniatura es decorativa: su fallo no es un error del producto */
  }
}
