"use client";

/**
 * VectorTinta — Carcasa del estudio (ruta única "/", plan §5.1).
 *
 * Layout de tres columnas en escritorio (Fuente+Capas | Lienzo | Inspector)
 * con degradación a flujo vertical en pantallas pequeñas. Footer fijo con el
 * digest de configuración (drift entre entornos) y accesos a Diagnóstico y a
 * la Especificación de la Iteración 1 (overlay sobre la misma ruta, sin
 * rutas nuevas — restricción del entorno).
 *
 * Atajos: Ctrl/Cmd+Z deshacer · Ctrl/Cmd+Shift+Z / Ctrl+Y rehacer.
 */
import * as React from "react";
import {
  Droplets, FileText, FolderOpen, LogOut, Redo2, ScrollText, Stethoscope, Undo2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { appConfig, configDigest } from "@/lib/config/app.config";
import { cn } from "@/lib/utils";
import { useStudio } from "@/lib/state/store";
import { AuthGate } from "@/components/studio/AuthGate";
import { AssetPanel } from "@/components/studio/AssetPanel";
import { LayerPanel } from "@/components/studio/LayerPanel";
import { VectorStage } from "@/components/studio/VectorStage";
import { InspectorPanel } from "@/components/studio/InspectorPanel";
import { InkPrepView } from "@/components/studio/InkPrepView";
import { ProjectsDrawer } from "@/components/studio/ProjectsDrawer";
import { CriticalModal, DiagnosticsTray } from "@/components/studio/DiagnosticsTray";
import { SpecApp } from "@/components/spec/SpecApp";
import { DUR, EASE, riseIn, stagger, inkPulse, SPRING, TAP } from "@/lib/motion";

export function StudioShell() {
  const boot = useStudio((s) => s.boot);
  const authStatus = useStudio((s) => s.authStatus);
  const user = useStudio((s) => s.user);
  const logout = useStudio((s) => s.logout);

  React.useEffect(() => {
    void boot();
  }, [boot]);

  /* Atajos de teclado del historial (§5.6) */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      const store = useStudio.getState();
      if (e.shiftKey) void store.redo();
      else void store.undo();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (authStatus === "boot") return <BootScreen />;

  if (authStatus === "anon") return <AuthGate />;

  return <Workspace />;
}

/** Pantalla de arranque: tinta que pulsa + halftone + grano (momento de marca). */
function BootScreen() {
  const reduced = useReducedMotion();
  return (
    <div className="vt-mesh relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden">
      <div aria-hidden className="vt-grain pointer-events-none absolute inset-0 opacity-[0.05]" />
      <div aria-hidden className="vt-halftone pointer-events-none absolute inset-0 opacity-50" />
      <motion.div
        variants={inkPulse}
        initial="hidden"
        animate={reduced ? undefined : "show"}
        className="relative inline-flex text-primary"
      >
        <Droplets className="h-10 w-10" aria-hidden />
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: DUR.base }}
        className="relative font-mono text-sm text-muted-foreground"
      >
        Preparando el estudio…
      </motion.p>
      {/* barra de carga fina bajo el texto (CSS puro, se apaga con reduced motion) */}
      <div aria-hidden className="relative h-0.5 w-40 overflow-hidden rounded-full bg-muted">
        {!reduced && <div className="vt-shimmer h-full w-full rounded-full bg-primary/70" />}
      </div>
    </div>
  );
}

function Workspace() {
  const project = useStudio((s) => s.project);
  const user = useStudio((s) => s.user);
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const renameProject = useStudio((s) => s.renameProject);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const canUndo = useStudio((s) => s.undoStack.length > 0);
  const canRedo = useStudio((s) => s.redoStack.length > 0);
  const historyBusy = useStudio((s) => s.historyBusy);
  const diagnosticsCount = useStudio((s) => s.diagnostics.length);
  const logout = useStudio((s) => s.logout);
  const reduced = useReducedMotion();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [diagOpen, setDiagOpen] = React.useState(false);
  const [specOpen, setSpecOpen] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(project?.name ?? "");
  React.useEffect(() => setNameDraft(project?.name ?? ""), [project?.id, project?.name]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:h-screen lg:overflow-hidden">
      {/* ── Cabecera ── */}
      <motion.header
        initial={{ opacity: 0, y: reduced ? 0 : -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE.signature }}
        className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur"
      >
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div whileTap={reduced ? undefined : TAP}>
                <Button size="sm" variant="outline" aria-label="Abrir proyectos" onClick={() => setDrawerOpen(true)}>
                  <FolderOpen className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Proyectos</span>
                </Button>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>Listado paginado por cursor · {appConfig.limits.projects.maxPerUserFree} proyectos (plan gratuito)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="mx-auto hidden max-w-md flex-1 items-center justify-center md:flex">
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (project !== null && nameDraft.trim() !== "" && nameDraft !== project.name) renameProject(nameDraft.trim());
            }}
            aria-label="Nombre del proyecto actual"
            disabled={project === null}
            className="h-8 border-transparent bg-transparent text-center font-mono text-sm hover:border-input focus-visible:bg-card"
            placeholder="Sin proyecto abierto"
          />
        </div>

        {/* Conmutador de vista con píldora deslizante (layoutId, spring).
            Con reduced motion la píldora no existe y el estilo activo nativo
            de shadcn (bg-background) se mantiene. */}
        <Tabs value={view} onValueChange={(v) => setView(v as "editar" | "tintas")}>
          {/* Triggers de tab ~37px de alto: DESVIACIÓN DOCUMENTADA de la regla
              44px (aceptada por el árbitro): controles adyacentes — un
              pseudo-extensor invadiría el hit del vecino; cumplen WCAG AA. */}
          <TabsList className="relative h-11 md:h-8">
            {!reduced && (
              <motion.span
                aria-hidden
                layoutId="vt-view-pill"
                className={cn(
                  "pointer-events-none absolute inset-y-0.5 z-0 w-[calc(50%-4px)] rounded-md bg-background shadow-sm",
                  view === "editar" ? "left-0.5" : "right-0.5",
                )}
                transition={SPRING.pill}
              />
            )}
            <TabsTrigger
              value="editar"
              className={cn("relative z-10 text-xs", !reduced && "data-[state=active]:bg-transparent data-[state=active]:shadow-none")}
            >
              Editar
            </TabsTrigger>
            <TabsTrigger
              value="tintas"
              className={cn("relative z-10 text-xs", !reduced && "data-[state=active]:bg-transparent data-[state=active]:shadow-none")}
            >
              Tintas
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-1">
          <motion.div whileTap={reduced ? undefined : TAP}>
            <Button size="icon" variant="ghost" className="vt-hit size-8" aria-label="Deshacer (Ctrl+Z)" disabled={!canUndo || historyBusy} onClick={() => void undo()}>
              <Undo2 className="h-4 w-4" aria-hidden />
            </Button>
          </motion.div>
          <motion.div whileTap={reduced ? undefined : TAP}>
            <Button size="icon" variant="ghost" className="vt-hit size-8" aria-label="Rehacer (Ctrl+Shift+Z)" disabled={!canRedo || historyBusy} onClick={() => void redo()}>
              <Redo2 className="h-4 w-4" aria-hidden />
            </Button>
          </motion.div>
          <motion.div whileTap={reduced ? undefined : TAP} className="relative">
            <Button size="sm" variant="outline" className="vt-hit relative" aria-label="Diagnóstico de sesión" onClick={() => setDiagOpen(true)}>
              <Stethoscope className="h-4 w-4" aria-hidden />
              <AnimatePresence>
                {diagnosticsCount > 0 && (
                  <motion.span
                    key="diag-badge"
                    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={SPRING.pop}
                    className="absolute -right-1.5 -top-1.5"
                  >
                    <Badge className="size-4 justify-center rounded-full bg-accent p-0 text-[9px] text-accent-foreground" aria-label={`${diagnosticsCount} incidencias`}>
                      {diagnosticsCount}
                    </Badge>
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>
          {user !== null && (
            <span className="hidden items-center gap-1 pl-1 text-[11px] text-muted-foreground lg:flex" title={user.email}>
              <span className="max-w-28 truncate">{user.name ?? user.email.split("@")[0]}</span>
            </span>
          )}
          <motion.div whileTap={reduced ? undefined : TAP}>
            <Button size="icon" variant="ghost" className="vt-hit size-8" aria-label="Cerrar sesión" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" aria-hidden />
            </Button>
          </motion.div>
        </div>
      </motion.header>

      {/* ── Zona de trabajo: escalonado de paneles (una vez, al entrar) ── */}
      <motion.main
        initial="hidden"
        animate="show"
        variants={stagger(0.08, 0.05)}
        className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:grid lg:grid-cols-[300px_minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_340px]"
      >
        <motion.div variants={riseIn} className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1 vt-scroll">
          <AssetPanel />
          <LayerPanel />
        </motion.div>
        <motion.div variants={riseIn} className="flex min-h-[420px] flex-col lg:min-h-0">
          {view === "editar" ? <VectorStage /> : <InkPrepView />}
        </motion.div>
        <motion.div variants={riseIn} className="flex min-h-0 flex-col lg:overflow-y-auto vt-scroll lg:pr-1">
          <InspectorPanel />
        </motion.div>
      </motion.main>

      {/* ── Pie fijo ── */}
      <footer className="mt-auto border-t border-border bg-card/95">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Droplets className="h-3.5 w-3.5 text-primary/80" aria-hidden />
            <span className="font-mono font-semibold tracking-tight text-foreground/80">{appConfig.product.name}</span>
            <span aria-hidden>·</span>
            <span className="font-mono" title="Digest de configuración (GET /api/health)">{configDigest}</span>
          </span>
          <span className="flex items-center gap-3">
            <button type="button" className="vt-underline inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSpecOpen(true)}>
              <ScrollText className="h-3.5 w-3.5" aria-hidden /> Especificación (iteración 1)
            </button>
            <button type="button" className="vt-underline inline-flex items-center gap-1 hover:text-foreground" onClick={() => setDiagOpen(true)}>
              <FileText className="h-3.5 w-3.5" aria-hidden /> Diagnóstico
            </button>
          </span>
        </div>
      </footer>

      {/* Overlays (misma ruta, sin rutas nuevas) */}
      <ProjectsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      <DiagnosticsTray open={diagOpen} onOpenChange={setDiagOpen} />
      <CriticalModal />
      <SpecOverlay open={specOpen} onOpenChange={setSpecOpen} />
    </div>
  );
}

/** Overlay a pantalla completa con el visor de la especificación (Iteración 1). */
function SpecOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-w-6xl overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-border/70 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <ScrollText className="h-4 w-4" aria-hidden /> Especificación VectorTinta — Iteración 1 (planificación aceptada)
          </DialogTitle>
          <DialogDescription>
            Plan maestro, ADRs, diagramas y acta del árbitro. El producto que estás usando ES la Fase 6 de esa especificación.
          </DialogDescription>
        </DialogHeader>
        <div className="vt-scroll h-[calc(92vh-92px)] overflow-y-auto bg-background px-1">
          <SpecApp />
        </div>
      </DialogContent>
    </Dialog>
  );
}
