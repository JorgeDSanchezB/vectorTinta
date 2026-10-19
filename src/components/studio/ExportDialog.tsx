"use client";

/**
 * VectorTinta — Diálogo de exportación (plan §1.1 punto 7).
 *
 * ZIP: se ensambla en el Worker (fflate); PNG mockup: en el hilo principal
 * (rasteriza SVG con canvas). Después de construir: descarga local inmediata
 * + registro persistente en el proyecto (multipart + checksum sha-256, S-06).
 */
import * as React from "react";
import { CheckCircle2, Download, FileArchive, ImageDown, Loader2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { exporterRegistry } from "@/lib/registries/exporter-registry";
import { useStudio } from "@/lib/state/store";
import { ProgressLine } from "@/components/studio/molecules";

export function ExportDialog({
  open,
  onOpenChange,
  formatId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formatId: "zip-serigrafia" | "png-mockup";
}) {
  const layers = useStudio((s) => s.layers);
  const source = useStudio((s) => s.source);
  const exportStatus = useStudio((s) => s.exportStatus);
  const exportPhase = useStudio((s) => s.exportPhase);
  const exportPercent = useStudio((s) => s.exportPercent);
  const exportProblem = useStudio((s) => s.exportProblem);
  const lastExport = useStudio((s) => s.lastExport);
  const lastLocalDownload = useStudio((s) => s.lastLocalDownload);
  const runExport = useStudio((s) => s.runExport);
  const loadRecentExports = useStudio((s) => s.loadRecentExports);

  const visibles = layers.filter((l) => l.visible).length;
  const entry = exporterRegistry.get(formatId);
  const running = exportStatus === "building" || exportStatus === "uploading";

  React.useEffect(() => {
    if (open && exportStatus === "idle") {
      void runExport(formatId);
    }
  }, [open]); // arranque único al abrir: el efecto solo dispara la construcción una vez

  React.useEffect(() => {
    if (open) void loadRecentExports();
  }, [open, loadRecentExports]);

  const Icon = formatId === "zip-serigrafia" ? FileArchive : ImageDown;

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <Icon className="h-4 w-4" aria-hidden /> {entry?.label ?? formatId}
          </DialogTitle>
          <DialogDescription>
            {visibles} capa(s) visible(s) · {source !== null ? `${source.width}×${source.height}px` : "tamaño de la fuente"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3" aria-live="polite">
          {running && (
            <>
              <ProgressLine percent={exportPercent} phase={exportPhase} />
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {exportStatus === "building" ? "Ensamblando en el navegador…" : "Registrando en el proyecto…"}
              </p>
            </>
          )}
          {exportStatus === "done" && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Listo: descargado y registrado con manifiesto.
              </p>
              <div className="flex flex-wrap gap-2">
                {lastLocalDownload !== null && (
                  <a href={lastLocalDownload.url} download={lastLocalDownload.fileName}>
                    <Button size="sm" variant="outline">
                      <Download className="mr-1 h-3.5 w-3.5" aria-hidden /> Descargar de nuevo
                    </Button>
                  </a>
                )}
                {lastExport !== null && (
                  <a href={lastExport.downloadUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline">
                      <FileArchive className="mr-1 h-3.5 w-3.5" aria-hidden /> Abrir copia persistida
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )}
          {exportStatus === "error" && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {exportProblem ?? "La exportación falló."}
              </p>
              <Button size="sm" variant="outline" onClick={() => void runExport(formatId)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden /> Reintentar
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="text-[11px] text-muted-foreground">
          El manifiesto valida contra el esquema del ExporterRegistry antes de salir del navegador.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
