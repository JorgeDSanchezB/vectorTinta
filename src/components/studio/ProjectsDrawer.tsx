"use client";

/**
 * VectorTinta — Cajón de proyectos (plan §5.4).
 *
 * SIEMPRE virtualizado (n puede llegar a 500): react-window con claves
 * estables (id, nunca índice). El botón "cargar más" consume el cursor del
 * servidor; el listado acepta ?limit=&cursor= en TODOS los listados (§3.1).
 */
import * as React from "react";
import { FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { List, type RowComponentProps } from "react-window";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { appConfig } from "@/lib/config/app.config";
import type { ProjectListItemDto } from "@/lib/domain/entities";
import { useStudio } from "@/lib/state/store";
import { PanelStates, QuotaMeter } from "@/components/studio/molecules";
import { format } from "date-fns";

interface RowProps {
  projects: ProjectListItemDto[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onAskDelete: (id: string) => void;
}

const ROW_HEIGHT = 64;

function ProjectRow({ index, style, projects, currentId, onOpen, onAskDelete }: RowComponentProps<RowProps>) {
  const p = projects[index];
  if (p === undefined) return null;
  const isCurrent = p.id === currentId;
  return (
    <div style={style} className="px-1 pb-1">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(p.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onOpen(p.id);
        }}
        className={`group relative flex h-full cursor-pointer items-center gap-3 overflow-hidden rounded-lg border px-3 transition-colors ${
          isCurrent
            ? "border-[var(--vt-copper)]/45 bg-[var(--vt-copper-soft)]"
            : "border-border/70 bg-card/70 hover:border-foreground/20 hover:bg-secondary/50"
        }`}
      >
        {isCurrent && (
          <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[var(--vt-copper)]" />
        )}
        {typeof p.thumbnailUrl === "string" ? (
          <img src={p.thumbnailUrl} alt={`Miniatura de ${p.name}`} className="h-11 w-11 rounded-md border border-border object-contain" loading="lazy" />
        ) : (
          <span className="vt-halftone flex h-11 w-11 items-center justify-center rounded-md border border-border" aria-hidden>
            <FolderOpen className="size-4 text-muted-foreground" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{p.name}</span>
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {p.layerCount} capas · {format(new Date(p.createdAt), "d MMM yyyy", { locale: undefined })}
          </span>
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="vt-hit size-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Eliminar el proyecto ${p.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onAskDelete(p.id);
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function ProjectsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const projects = useStudio((s) => s.projects);
  const projectsLoading = useStudio((s) => s.projectsLoading);
  const projectsError = useStudio((s) => s.projectsError);
  const projectsHasMore = useStudio((s) => s.projectsHasMore);
  const currentId = useStudio((s) => s.project?.id ?? null);
  const loadProjects = useStudio((s) => s.loadProjects);
  const openProject = useStudio((s) => s.openProject);
  const createProject = useStudio((s) => s.createProject);
  const deleteProject = useStudio((s) => s.deleteProject);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [askDelete, setAskDelete] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) void loadProjects({ reset: true });
  }, [open, loadProjects]);

  const status = projects.length === 0 ? (projectsLoading ? "loading" : projectsError !== null ? "error" : "empty") : "ready";

  const submitCreate = async (): Promise<void> => {
    if (name.trim() === "") return;
    setCreating(true);
    try {
      await createProject(name.trim(), description.trim() !== "" ? description.trim() : null);
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch {
      /* el diagnóstico/toast lo emite el slice */
    } finally {
      setCreating(false);
    }
  };

  const target = askDelete !== null ? projects.find((p) => p.id === askDelete) ?? null : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[340px] flex-col gap-0 p-0 sm:w-[380px]">
        <SheetHeader className="border-b border-border/70 p-4">
          <SheetTitle className="font-mono text-base">Proyectos</SheetTitle>
          <SheetDescription>Tu taller, paginado por cursor.</SheetDescription>
          {/* Cuota viva (ARB1-1) FUERA de SheetDescription (ARB2-1: Radix la emite
              como <p> y un <div> anidado es DOM inválido + riesgo de hydration). */}
          <div className="pt-1">
            <QuotaMeter used={projects.length} max={appConfig.limits.projects.maxPerUserFree} label="plan gratuito" />
          </div>
        </SheetHeader>

        <div className="border-b border-border/70 p-3">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCreate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="np-name" className="text-[11px]">Nombre del proyecto</Label>
              <Input
                id="np-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={appConfig.limits.projects.nameMaxLength}
                placeholder="Camiseta festival"
                className="h-8 text-sm"
              />
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción (opcional)"
              aria-label="Descripción del proyecto"
              className="min-h-16 text-xs"
            />
            <Button type="submit" size="sm" className="vt-btn-copper w-full font-semibold" disabled={creating || name.trim() === ""}>
              {creating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />}
              Crear proyecto
            </Button>
          </form>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <PanelStates
            ariaLabel="Listado de proyectos"
            status={status}
            error={projectsError?.detail ?? projectsError?.title}
            onRetry={() => void loadProjects({ reset: true })}
            empty={<p className="text-sm">Aún no hay proyectos. Crea el primero arriba ↑</p>}
          >
            <List
              rowComponent={ProjectRow}
              rowProps={{ projects, currentId, onOpen: (id) => { onOpenChange(false); void openProject(id); }, onAskDelete: setAskDelete }}
              rowCount={projects.length}
              rowHeight={ROW_HEIGHT}
              rowKey={(index) => projects[index]?.id ?? String(index)}
              style={{ width: "100%", height: "100%", paddingLeft: 8, paddingTop: 8 }}
              aria-label="Listado virtualizado de proyectos"
            />
          </PanelStates>
          {projectsHasMore && (
            <div className="border-t border-border/70 p-2">
              <Button size="sm" variant="outline" className="w-full" disabled={projectsLoading} onClick={() => void loadProjects()}>
                {projectsLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Cargar más
              </Button>
            </div>
          )}
        </div>
      </SheetContent>

      <AlertDialog open={askDelete !== null} onOpenChange={(v) => !v && setAskDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar “{target?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el proyecto con sus imágenes, vectorizaciones, capas y exportaciones (borrado en cascada). No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (askDelete !== null) void deleteProject(askDelete);
                setAskDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
