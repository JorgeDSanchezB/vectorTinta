"use client";

/**
 * VectorTinta — Panel de imagen fuente y eliminación de fondo (plan §1.1:
 * puntos 1 y 3; ADR-009 cliente).
 *
 * El fondo se quita en el NAVEGADOR (Worker chroma-edge) y es REVERSIBLE:
 * la máscara alfa es un comando del historial (Ctrl+Z la devuelve). La
 * operación u2net-onnx está registrada pero bloqueada por CONFIG hasta que
 * exista NEXT_PUBLIC_BG_REMOVAL_MODEL_URL (el motor lo explica con el nombre
 * exacto de la variable).
 */
import * as React from "react";
import { Eraser, Info, ShieldAlert, Upload } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { appConfig } from "@/lib/config/app.config";
import { getOperation, listOperations } from "@/lib/registries/operation-registry";
import { useStudio } from "@/lib/state/store";
import { OkChip, PanelStates, ProgressLine } from "@/components/studio/molecules";
import { useSmallViewport } from "@/components/studio/hooks";
import { toast } from "sonner";
import { DUR, EASE } from "@/lib/motion";

const BG_OPS = listOperations().filter((op) => op.id.startsWith("bg-"));

export function AssetPanel() {
  const project = useStudio((s) => s.project);
  const source = useStudio((s) => s.source);
  const sourceStatus = useStudio((s) => s.sourceStatus);
  const sourceProblem = useStudio((s) => s.sourceProblem);
  const hasAlpha = useStudio((s) => s.hasAlpha);
  const bgBusy = useStudio((s) => s.bgBusy);
  const bgPhase = useStudio((s) => s.bgPhase);
  const bgPercent = useStudio((s) => s.bgPercent);
  const uploadSource = useStudio((s) => s.uploadSource);
  const runBgRemoval = useStudio((s) => s.runBgRemoval);
  const openProject = useStudio((s) => s.openProject);

  const small = useSmallViewport();
  const reduced = useReducedMotion();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [opId, setOpId] = React.useState("bg-chroma-edge");
  const [tolerance, setTolerance] = React.useState(18);
  const [feather, setFeather] = React.useState(true);

  const op = getOperation(opId);
  const engineId = op?.engineId ?? "chroma-edge";
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (source === null || canvasRef.current === null) return;
    const canvas = canvasRef.current;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    const img = ctx.createImageData(source.width, source.height);
    img.data.set(source.imageData.data);
    ctx.putImageData(img, 0, 0);
  }, [source]);

  const takeFile = (file: File | undefined): void => {
    if (file === undefined) return;
    void uploadSource(file, file.name, file.type);
  };

  return (
    <Card className="vt-panel flex shrink-0 flex-col">
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="size-4 text-[var(--vt-copper)]" aria-hidden /> Imagen fuente
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 pb-4">
        {small && (
          <p role="note" className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] leading-snug text-amber-200/90">
            Pantalla pequeña: las operaciones pesadas (vectorizar, quitar fondo, exportar) quedan bloqueadas por presupuesto de rendimiento (configuración móvil).
          </p>
        )}

        <PanelStates
          ariaLabel="Fuente"
          status={project === null ? "empty" : sourceStatus === "empty" ? "ready" : sourceStatus}
          error={sourceProblem?.detail ?? sourceProblem?.title}
          onRetry={project === null ? undefined : () => void openProject(project.id)}
          empty={<p className="text-sm">Abre o crea un proyecto para empezar.</p>}
          skeletonRows={2}
        >
          {project !== null && sourceStatus === "empty" ? (
            <motion.div
              role="button"
              tabIndex={0}
              aria-label="Subir imagen fuente"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                takeFile(e.dataTransfer.files[0]);
              }}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.985 }}
              animate={{ opacity: 1, scale: dragOver && !reduced ? 1.015 : 1 }}
              transition={{ duration: DUR.base, ease: EASE.signature }}
              className={`group flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-6 text-center transition-colors duration-300 ${
                dragOver
                  ? "border-[var(--vt-copper)]/70 bg-[var(--vt-copper-soft)]"
                  : "border-border hover:border-foreground/30 hover:bg-secondary/40"
              }`}
            >
              <motion.span
                className={`inline-flex size-11 items-center justify-center rounded-full border transition-colors ${
                  dragOver ? "border-[var(--vt-copper)]/60 text-[var(--vt-copper)]" : "border-border text-muted-foreground group-hover:text-foreground/80"
                }`}
                animate={reduced ? undefined : dragOver ? { y: 0, scale: 1.08 } : { y: [0, -4, 0], scale: 1 }}
                transition={reduced ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <Upload className="size-5" aria-hidden />
              </motion.span>
              <p className="text-sm font-medium">Arrastra tu arte aquí o haz clic</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {appConfig.limits.image.allowedMimeTypes.join(" · ")} · máx {Math.round(appConfig.limits.image.maxUploadBytes / 1048576)} MiB ·{" "}
                {appConfig.limits.image.maxDimension}px por lado
              </p>
              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                Si supera los límites, se adapta sola en tu navegador antes de subir.
              </p>
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                accept={appConfig.limits.image.allowedMimeTypes.join(",")}
                onChange={(e) => {
                  takeFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </motion.div>
          ) : source !== null ? (
            <div className="space-y-2.5">
              <div className="vt-checker overflow-hidden rounded-lg border border-border">
                <canvas ref={canvasRef} className="block h-auto w-full" aria-label="Vista de la imagen fuente" style={{ maxHeight: 210 }} />
              </div>
              {/* Metadatos: una columna (label izq · valor der), filas mono
                  con separador punteado — cero colisiones garantizadas. */}
              <dl className="space-y-1 rounded-lg bg-secondary/30 px-2.5 py-2 font-mono text-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">Dimensiones</dt>
                  <span aria-hidden className="mx-1 min-w-3 flex-1 border-b border-dotted border-border" />
                  <dd className="shrink-0 tabular-nums">{source.width}×{source.height}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">Peso</dt>
                  <span aria-hidden className="mx-1 min-w-3 flex-1 border-b border-dotted border-border" />
                  <dd className="shrink-0 tabular-nums">{(source.bytes / 1024).toFixed(0)} KiB</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">MIME</dt>
                  <span aria-hidden className="mx-1 min-w-3 flex-1 border-b border-dotted border-border" />
                  <dd className="shrink-0">{source.mimeType}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">sha-256</dt>
                  <span aria-hidden className="mx-1 min-w-3 flex-1 border-b border-dotted border-border" />
                  <dd className="shrink-0">
                    <button
                      type="button"
                      title={`Copiar sha-256 completo: ${source.checksum}`}
                      aria-label="Copiar sha-256 completo"
                      className="rounded px-0.5 py-0 transition-colors hover:bg-secondary hover:text-foreground"
                      onClick={() => {
                        void navigator.clipboard?.writeText(source.checksum).then(() => {
                          toast.info("sha-256 copiado al portapapeles");
                        });
                      }}
                    >
                      {source.checksum.slice(0, 10)}…
                    </button>
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-1.5">
                {source.bgApplied ? <OkChip>Fondo eliminado · reversible (Ctrl+Z)</OkChip> : hasAlpha ? <OkChip>Alfa nativo</OkChip> : null}
                <Button variant="outline" size="sm" className="h-7" onClick={() => inputRef.current?.click()} disabled={bgBusy}>
                  Reemplazar imagen
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  className="sr-only"
                  accept={appConfig.limits.image.allowedMimeTypes.join(",")}
                  onChange={(e) => {
                    takeFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          ) : null}
        </PanelStates>

        {/* ── Eliminación de fondo (cliente, reversible) ── */}
        {source !== null && (
          <div className="space-y-2.5 rounded-lg border border-border/80 bg-secondary/30 p-2.5">
            <div className="flex items-center gap-1.5">
              <Eraser className="size-3.5 text-[var(--vt-copper)]" aria-hidden />
              <h3 className="text-xs font-semibold">Quitar fondo</h3>
              {op?.metadata?.licencia === "pending-audit" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-normal text-amber-300/90">
                  <ShieldAlert className="size-3" aria-hidden /> licencia pendiente
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bg-op" className="vt-label">Motor</Label>
              <Select value={opId} onValueChange={setOpId}>
                <SelectTrigger id="bg-op" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BG_OPS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                      {o.metadata?.licencia === "pending-audit" ? " (bloqueado: licencia)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">{op?.description}</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="bg-tol" className="text-[11px] text-muted-foreground">Tolerancia</Label>
                <span className="font-mono text-[11px] tabular-nums text-foreground/80">{tolerance} %</span>
              </div>
              <Slider id="bg-tol" value={[tolerance]} min={0} max={100} step={1} onValueChange={(v) => setTolerance(v[0] ?? tolerance)} disabled={bgBusy} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="bg-feather" className="text-[11px] text-muted-foreground">Suavizar borde (1 px)</Label>
              <Switch id="bg-feather" checked={feather} onCheckedChange={setFeather} disabled={bgBusy} />
            </div>
            <Button
              size="sm"
              className="h-8 w-full text-xs font-semibold"
              disabled={bgBusy || small}
              onClick={() => {
                void runBgRemoval(engineId, { tolerance, feather }).then(() => undefined, (e) => {
                  toast.error("El motor de fondo devolvió un problema", { description: e instanceof Error ? e.message : undefined });
                });
              }}
            >
              <Eraser className="mr-1 size-3.5" aria-hidden /> Quitar fondo en el navegador
            </Button>
            <ProgressLine percent={bgPercent} phase={bgPhase} />
            <p className="flex items-start gap-1 text-[10px] leading-snug text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
              La máscara alfa no se persiste: es un paso local y reversible antes de vectorizar (ADR-009).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
