"use client";

/**
 * VectorTinta — Carcasa del estudio (ruta única "/", plan §5.1).
 *
 * DESIGN v3 «Mesa de Tinta»: el workspace se sirve en cromo oscuro cálido
 * (la mesa de entintado); la obra vive en una hoja de papel clara sobre la
 * mesa (VectorStage). El scope de tema se aplica al <body> mientras el
 * workspace está montado para que TODOS los portales (Sheet, Dialog,
 * Popover, toast) hereden el mismo tema; al desmontarse (logout) la puerta
 * de acceso vuelve a su tema claro de taller.
 *
 * Layout: grid por áreas. Escritorio — fuente (auto) + capas (1fr) a la
 * izquierda, lienzo al centro (dos filas), inspector a la derecha. Móvil —
 * historia vertical: fuente → lienzo → inspector → capas.
 *
 * Atajos: Ctrl/Cmd+Z deshacer · Ctrl/Cmd+Shift+Z / Ctrl+Y rehacer.
 */
import * as React from "react";
import {
  Droplets, FileText, FolderOpen, LogOut, PenLine, Redo2, ScrollText, Stethoscope, Undo2,
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

  /* Tema «Mesa de Tinta» en el <body>: los portales (Sheet/Dialog/Popover/
     toast) viven fuera de este árbol React y deben heredar el scope. */
  React.useEffect(() => {
    document.body.classList.add("vt-studio");
    return () => document.body.classList.remove("vt-studio");
  }, []);

  const initials = (user?.name ?? user?.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : DUR.slow, ease: EASE.inOut }}
      className="flex min-h-screen flex-col bg-background text-foreground lg:h-screen lg:overflow-hidden"
    >
      {/* ── Barra superior del estudio ── */}
      <motion.header
        initial={{ opacity: 0, y: reduced ? 0 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE.signature }}
        className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 sm:gap-2 sm:px-3"
      >
        {/* Marca del taller */}
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-[#d13a54] to-[#b52440] shadow-[inset_0_1px_0_rgba(255,246,240,0.25),0_2px_8px_-2px_rgba(193,40,65,0.55)]">
          <Droplets className="size-3.5 text-[#fff6f0]" />
        </span>
        <span className="hidden shrink-0 text-[13px] font-semibold tracking-tight md:block">
          VectorTinta
        </span>
        <span aria-hidden className="hidden h-4 w-px bg-border md:block" />

        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div whileTap={reduced ? undefined : TAP}>
                <Button size="sm" variant="ghost" className="vt-hit h-8 gap-1.5 rounded-full px-2.5 text-xs" aria-label="Abrir proyectos" onClick={() => setDrawerOpen(true)}>
                  <FolderOpen className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">Proyectos</span>
                </Button>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>Listado paginado por cursor · {appConfig.limits.projects.maxPerUserFree} proyectos (plan gratuito)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Nombre del proyecto: píldora editable */}
        <div className="mx-auto flex min-w-0 max-w-[260px] flex-1 justify-center px-1">
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (project !== null && nameDraft.trim() !== "" && nameDraft !== project.name) renameProject(nameDraft.trim());
            }}
            aria-label="Nombre del proyecto actual"
            disabled={project === null}
            className="h-7 w-full min-w-0 rounded-full border-transparent bg-transparent text-center text-xs font-medium placeholder:text-muted-foreground/60 hover:border-input focus-visible:bg-secondary"
            placeholder="Sin proyecto abierto"
          />
        </div>

        {/* Conmutador de vista con píldora deslizante (layoutId, spring).
            Con reduced motion la píldora no existe y el estilo activo nativo
            de shadcn se mantiene. */}
        <Tabs value={view} onValueChange={(v) => setView(v as "editar" | "tintas")}>
          {/* Triggers de tab ~30px de alto: DESVIACIÓN DOCUMENTADA de la regla
              44px (aceptada por el árbitro): controles adyacentes — un
              pseudo-extensor invadiría el hit del vecino; cumplen WCAG AA. */}
          <TabsList className="h-8 rounded-full border border-border bg-secondary/60 p-0.5">
            {!reduced && (
              <motion.span
                aria-hidden
                layoutId="vt-view-pill"
                className={cn(
                  "pointer-events-none absolute inset-y-0.5 z-0 w-[calc(50%-2px)] rounded-full bg-[rgba(251,248,238,0.09)] shadow-[inset_0_1px_0_rgba(251,248,238,0.07),0_1px_3px_rgba(0,0,0,0.35)]",
                  view === "editar" ? "left-0.5" : "right-0.5",
                )}
                transition={SPRING.pill}
              />
            )}
            <TabsTrigger
              value="editar"
              className={cn("relative z-10 h-7 gap-1.5 rounded-full px-2.5 text-[11px] font-medium sm:px-3", !reduced && "data-[state=active]:bg-transparent data-[state=active]:shadow-none")}
            >
              <PenLine className="hidden size-3 sm:inline" aria-hidden /> Editar
            </TabsTrigger>
            <TabsTrigger
              value="tintas"
              className={cn("relative z-10 h-7 gap-1.5 rounded-full px-2.5 text-[11px] font-medium sm:px-3", !reduced && "data-[state=active]:bg-transparent data-[state=active]:shadow-none")}
            >
              <Droplets className="hidden size-3 sm:inline" aria-hidden /> Tintas
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Grupo deshacer/rehacer: cápsula de toolbar pro */}
          <span className="flex items-center rounded-full border border-border bg-secondary/60 p-0.5">
            <motion.div whileTap={reduced ? undefined : TAP}>
              <Button size="icon" variant="ghost" className="vt-hit size-7 rounded-full" aria-label="Deshacer (Ctrl+Z)" disabled={!canUndo || historyBusy} onClick={() => void undo()}>
                <Undo2 className="size-3.5" aria-hidden />
              </Button>
            </motion.div>
            <motion.div whileTap={reduced ? undefined : TAP}>
              <Button size="icon" variant="ghost" className="vt-hit size-7 rounded-full" aria-label="Rehacer (Ctrl+Shift+Z)" disabled={!canRedo || historyBusy} onClick={() => void redo()}>
                <Redo2 className="size-3.5" aria-hidden />
              </Button>
            </motion.div>
          </span>

          <motion.div whileTap={reduced ? undefined : TAP} className="relative">
            <Button size="icon" variant="ghost" className="vt-hit relative size-8 rounded-full" aria-label="Diagnóstico de sesión" onClick={() => setDiagOpen(true)}>
              <Stethoscope className="size-3.5" aria-hidden />
              <AnimatePresence>
                {diagnosticsCount > 0 && (
                  <motion.span
                    key="diag-badge"
                    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={SPRING.pop}
                    className="absolute -right-0.5 -top-0.5"
                  >
                    <Badge className="size-4 justify-center rounded-full bg-primary p-0 text-[9px] text-primary-foreground" aria-label={`${diagnosticsCount} incidencias`}>
                      {diagnosticsCount}
                    </Badge>
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>

          {user !== null && (
            <span className="hidden h-8 items-center gap-2 rounded-full border border-border bg-secondary/60 pl-1 pr-2.5 lg:flex" title={user.email}>
              <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-[var(--vt-copper-soft)] font-mono text-[10px] font-semibold text-[var(--vt-copper)]">
                {initials}
              </span>
              <span className="max-w-24 truncate text-[11px] text-muted-foreground">{user.name ?? user.email.split("@")[0]}</span>
            </span>
          )}
          <motion.div whileTap={reduced ? undefined : TAP}>
            <Button size="icon" variant="ghost" className="vt-hit size-8 rounded-full" aria-label="Cerrar sesión" onClick={() => void logout()}>
              <LogOut className="size-3.5" aria-hidden />
            </Button>
          </motion.div>
        </div>
      </motion.header>

      {/* ── Mesa de trabajo: grid por áreas, escalonado de entrada ──
          Móvil: fuente → lienzo → inspector → capas (historia vertical).
          Escritorio: filas FRACCIONADAS y acotadas — fuente (3fr, scroll
          interno propio) + capas (2fr, SIEMPRE dentro del viewport) | lienzo
          (ambas filas) | inspector (ambas filas). */}
      <motion.main
        initial="hidden"
        animate="show"
        variants={stagger(0.07, 0.06)}
        className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[300px_minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,11fr)_minmax(0,9fr)] lg:[grid-template-areas:'source_canvas_inspector''layers_canvas_inspector'] xl:grid-cols-[320px_minmax(0,1fr)_340px]"
      >
        <motion.div variants={riseIn} className="order-1 flex min-h-0 flex-col lg:[grid-area:source] lg:overflow-y-auto lg:pr-1 vt-scroll">
          <AssetPanel />
        </motion.div>
        <motion.div variants={riseIn} className="order-2 flex min-h-[380px] flex-col lg:min-h-0 lg:[grid-area:canvas]">
          {view === "editar" ? <VectorStage /> : <InkPrepView />}
        </motion.div>
        <motion.div variants={riseIn} className="order-3 flex min-h-0 flex-col lg:[grid-area:inspector] lg:max-h-full lg:overflow-y-auto lg:pr-1 vt-scroll">
          <InspectorPanel />
        </motion.div>
        <motion.div variants={riseIn} className="order-4 flex min-h-0 flex-col lg:[grid-area:layers]">
          <LayerPanel />
        </motion.div>
      </motion.main>

      {/* ── Barra de estado ── */}
      <footer className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border bg-card/80 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur">
        <span className="flex min-w-0 items-center gap-1.5 font-mono">
          <span aria-hidden className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400/90" />
          </span>
          <span className="font-semibold tracking-tight text-foreground/80">{appConfig.product.name}</span>
          <span aria-hidden>·</span>
          <span title="Digest de configuración (GET /api/health)" className="truncate">{configDigest}</span>
        </span>
        <span className="flex items-center gap-3">
          <button type="button" className="vt-underline inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSpecOpen(true)}>
            <ScrollText className="size-3" aria-hidden /> Especificación (iteración 1)
          </button>
          <button type="button" className="vt-underline inline-flex items-center gap-1 hover:text-foreground" onClick={() => setDiagOpen(true)}>
            <FileText className="size-3" aria-hidden /> Diagnóstico
          </button>
        </span>
      </footer>

      {/* Overlays (misma ruta, sin rutas nuevas) */}
      <ProjectsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      <DiagnosticsTray open={diagOpen} onOpenChange={setDiagOpen} />
      <CriticalModal />
      <SpecOverlay open={specOpen} onOpenChange={setSpecOpen} />
    </motion.div>
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
