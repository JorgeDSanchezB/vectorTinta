"use client";

/**
 * VectorTinta — Bandeja de diagnóstico + modal de fallo crítico (plan §8,
 * failure-modes.md: "OOM del Worker → modal + Recuperar espacio de trabajo").
 */
import * as React from "react";
import { Activity, Download, LifeBuoy, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format } from "date-fns";
import { useStudio } from "@/lib/state/store";
import { EmptyState, StateChip } from "@/components/studio/molecules";

export function DiagnosticsTray({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const diagnostics = useStudio((s) => s.diagnostics);
  const clearDiagnostics = useStudio((s) => s.clearDiagnostics);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[380px] flex-col gap-0 p-0 sm:w-[420px]">
        <SheetHeader className="border-b border-border/70 p-4">
          <SheetTitle className="flex items-center gap-2 font-mono text-base">
            <Activity className="h-4 w-4" aria-hidden /> Diagnóstico de sesión
          </SheetTitle>
          <SheetDescription>Registro local de fallos clasificados con acción sugerida (failure-modes).</SheetDescription>
        </SheetHeader>
        <div className="vt-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {diagnostics.length === 0 ? (
            <EmptyState icon={Activity} title="Sin incidencias registradas" hint="Los fallos de red, datos y configuración aparecerán aquí clasificados." />
          ) : (
            diagnostics
              .slice()
              .reverse()
              .map((d) => (
                <div key={d.id} className="rounded-md border border-border/70 bg-card p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <StateChip clase={d.clase} />
                    <time className="font-mono text-[10px] text-muted-foreground">{format(d.at, "HH:mm:ss")}</time>
                  </div>
                  <p className="mt-1 text-xs font-medium leading-snug">{d.title}</p>
                  {d.detail !== undefined && <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">{d.detail}</p>}
                  {d.action !== undefined && <p className="mt-1 text-[11px] font-medium text-accent">→ {d.action}</p>}
                </div>
              ))
          )}
        </div>
        {diagnostics.length > 0 && (
          <div className="flex gap-2 border-t border-border/70 p-3">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => exportReport(diagnostics)}>
              <Download className="mr-1 h-3.5 w-3.5" aria-hidden /> Exportar informe
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={clearDiagnostics}>
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Limpiar
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function exportReport(entries: unknown): void {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vectortinta-diagnostico.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** Modal de fallo crítico con recuperación al último punto persistido (§8). */
export function CriticalModal() {
  const criticalProblem = useStudio((s) => s.criticalProblem);
  const dismissCritical = useStudio((s) => s.dismissCritical);
  const project = useStudio((s) => s.project);
  const openProject = useStudio((s) => s.openProject);
  const closeProject = useStudio((s) => s.closeProject);
  const diagnostics = useStudio((s) => s.diagnostics);

  const recover = (): void => {
    if (project !== null) void openProject(project.id);
    else closeProject();
    dismissCritical();
  };

  return (
    <AlertDialog open={criticalProblem !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-destructive" aria-hidden /> Fallo crítico del estudio
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              <p>{criticalProblem?.detail ?? "Se produjo un fallo no clasificado del motor."}</p>
              <p className="text-[11px] text-muted-foreground">
                La recuperación vuelve al último estado persistido en el servidor (plan §8: nunca se pierde lo confirmado).
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { exportReport(diagnostics); dismissCritical(); }}>
            Exportar informe y cerrar
          </AlertDialogCancel>
          <AlertDialogAction onClick={recover}>Recuperar espacio de trabajo</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
