/**
 * VectorTinta — Store raíz (ADR-004: Zustand, slices combinados).
 *
 * Los slices se combinan SIN middlwares pesados: el rendimiento del lienzo
 * depende de selectores finos (`useStudio(s => s.layers)`), no de middlewares.
 * `setOpenProjectRef` conecta el boot de auth con openProject sin acoplar los
 * slices entre sí (inyección en la creación del store).
 */
"use client";

import { create } from "zustand";
import { createAuthSlice, setOpenProjectRef, type AuthSlice } from "@/lib/state/slices/auth";
import { createProjectSlice, type ProjectSlice } from "@/lib/state/slices/project";
import { createDiagnosticsSlice, createHistorySlice, createToolSlice, type DiagnosticsSlice, type HistorySlice, type ToolSlice } from "@/lib/state/slices/tool";
import { createExportSlice, type ExportSlice } from "@/lib/state/slices/export";

export type Store = AuthSlice & ProjectSlice & ToolSlice & HistorySlice & ExportSlice & DiagnosticsSlice;

export const useStudio = create<Store>()((...args) => {
  const store = {
    ...createAuthSlice(...args),
    ...createProjectSlice(...args),
    ...createToolSlice(...args),
    ...createHistorySlice(...args),
    ...createExportSlice(...args),
    ...createDiagnosticsSlice(...args),
  };
  // Inyección tardía: auth.boot() abre el borrador sin importar project.ts.
  setOpenProjectRef(store.openProject);
  return store;
});

/** Selector fino idiomático (plan §5.3): una suscripción por dato. */
export const selectLayers = (s: Store) => s.layers;
export const selectView = (s: Store) => s.view;
export const selectAuth = (s: Store) => s.authStatus;

/** Sonda de verificación E2E (solo lectura del estado; sin datos personales). */
declare global {
  interface Window {
    __vtStore?: () => Store;
  }
}
if (typeof window !== "undefined") {
  window.__vtStore = () => useStudio.getState();
}
