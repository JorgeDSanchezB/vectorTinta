/**
 * VectorTinta — Slices de herramienta, historial y diagnóstico.
 *
 * toolSlice (plan §5.3): zoom/pan por mutación de viewBox-equivalente (transform),
 * selección por hit-test nativo, aislar capa como ESTADO DE VISTA (no persiste).
 *
 * historySlice (plan §5.6): pila acotada por configuración (limits.layers.
 * historyStackSize); los comandos viajan con apply/revert (posiblemente async).
 *
 * diagnosticsSlice (plan §8/failure-modes): registro del cliente con clase,
 * título, detalle y acción sugerida; los fallos importantes NUNCA se
 * convierten en silencio.
 */
"use client";

import type { StateCreator } from "zustand";
import { appConfig } from "@/lib/config/app.config";
import { ApiProblem } from "@/lib/domain/errors";
import type { Problem } from "@/lib/domain/errors";
import type { DiagnosticEntry, HistoryCommand } from "@/lib/state/types";
import { toast } from "sonner";
import { claseDeError } from "@/lib/state/slices/auth";
import type { Store } from "@/lib/state/store";

/* ────────────────────────── tool ────────────────────────── */

export type WorkspaceView = "editar" | "tintas";

export interface ToolSlice {
  view: WorkspaceView;
  zoom: number;
  pan: { x: number; y: number };
  selectedLayerId: string | null;
  isolatedLayerId: string | null;
  historyBusy: boolean;

  setView(view: WorkspaceView): void;
  setZoom(zoom: number): void;
  setPan(pan: { x: number; y: number }): void;
  selectLayer(layerId: string | null): void;
  isolateLayer(layerId: string | null): void;
  stageReady(width: number, height: number): void;
}

export const createToolSlice: StateCreator<Store, [], [], ToolSlice> = (set, get) => ({
  view: "editar",
  zoom: 1,
  pan: { x: 0, y: 0 },
  selectedLayerId: null,
  isolatedLayerId: null,
  historyBusy: false,

  setView(view) {
    set({ view });
  },
  setZoom(zoom) {
    set({ zoom: Math.min(64, Math.max(0.02, zoom)) });
  },
  setPan(pan) {
    set({ pan });
  },
  selectLayer(layerId) {
    set({ selectedLayerId: layerId });
  },
  isolateLayer(layerId) {
    set({ isolatedLayerId: layerId });
  },
  stageReady(width, height) {
    // Encuadre inicial: la primera vez que el lienzo mide algo, ajusta el arte.
    void width;
    void height;
    const stage = get();
    if (stage.zoom === 1 && stage.pan.x === 0 && stage.pan.y === 0) {
      // VectorStage aplica el encuadre real con el tamaño del contenedor.
    }
  },
});

/* ────────────────────────── history ────────────────────────── */

export interface HistorySlice {
  undoStack: HistoryCommand[];
  redoStack: HistoryCommand[];
  pushHistory(cmd: HistoryCommand): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  resetHistory(): void;
}

export const createHistorySlice: StateCreator<Store, [], [], HistorySlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],

  pushHistory(cmd) {
    const max = appConfig.limits.layers.historyStackSize; // 100 (config)
    const undoStack = [...get().undoStack, cmd].slice(-max);
    set({ undoStack, redoStack: [] });
  },

  async undo() {
    if (get().historyBusy) return;
    const stack = get().undoStack;
    const cmd = stack[stack.length - 1];
    if (cmd === undefined) return;
    set({ historyBusy: true });
    try {
      await cmd.revert();
      set({
        undoStack: stack.slice(0, -1),
        redoStack: [...get().redoStack, cmd],
      });
      toast.info(`Deshecho: ${cmd.label}`);
    } catch (e) {
      const problem = e instanceof ApiProblem ? e.problem : null;
      get().pushDiagnostic({
        clase: claseDeError(e),
        title: `No se pudo deshacer: ${cmd.label}`,
        detail: problem?.detail,
      });
    } finally {
      set({ historyBusy: false });
    }
  },

  async redo() {
    if (get().historyBusy) return;
    const stack = get().redoStack;
    const cmd = stack[stack.length - 1];
    if (cmd === undefined) return;
    set({ historyBusy: true });
    try {
      await cmd.apply();
      set({
        redoStack: stack.slice(0, -1),
        undoStack: [...get().undoStack, cmd],
      });
      toast.info(`Rehecho: ${cmd.label}`);
    } catch (e) {
      const problem = e instanceof ApiProblem ? e.problem : null;
      get().pushDiagnostic({
        clase: claseDeError(e),
        title: `No se pudo rehacer: ${cmd.label}`,
        detail: problem?.detail,
      });
    } finally {
      set({ historyBusy: false });
    }
  },

  resetHistory() {
    set({ undoStack: [], redoStack: [] });
  },
});

/* ────────────────────────── diagnostics ────────────────────────── */

const DIAG_CAP = 50; // techo del registro de sesión (no es valor de negocio)

export interface DiagnosticsSlice {
  diagnostics: DiagnosticEntry[];
  criticalProblem: Problem | null;
  pushDiagnostic(entry: { clase: string; title: string; detail?: string; action?: string }): void;
  clearDiagnostics(): void;
  dismissCritical(): void;
}

export const createDiagnosticsSlice: StateCreator<Store, [], [], DiagnosticsSlice> = (set, get) => ({
  diagnostics: [],
  criticalProblem: null,

  pushDiagnostic(entry) {
    const next: DiagnosticEntry = {
      id: crypto.randomUUID(),
      at: Date.now(),
      clase: entry.clase,
      title: entry.title,
      detail: entry.detail,
      action: entry.action,
    };
    set({ diagnostics: [...get().diagnostics, next].slice(-DIAG_CAP) });
    // Fallo crítico (clase interno / 5xx): modal de diagnóstico con recuperación.
    if (entry.clase === "interno" || entry.clase === "temporal") {
      if (entry.clase === "interno") {
        set({ criticalProblem: { type: "local/critico", title: entry.title, status: 500, detail: entry.detail } as Problem });
      }
    }
  },

  clearDiagnostics() {
    set({ diagnostics: [], criticalProblem: null });
  },

  dismissCritical() {
    set({ criticalProblem: null });
  },
});
