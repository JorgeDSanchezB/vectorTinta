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

  const accept = appConfig.limits.image.allowedMimeTypes.map((m) => `.${m.split("/")[1]}`).join(",");

  const takeFile = (file: File | undefined): void => {
    if (file === undefined) return;
    void uploadSource(file, file.name, file.type);
  };

  // FIX-2: shrink-0 — la columna lateral scrollea; la card conserva su altura
  // natural. Con min-h-0 se encogía y su contenido (metadatos) desbordaba
  // visualmente sobre la card "Quitar fondo".
  return (
    <Card className="vt-panel flex shrink-0 flex-col border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4" aria-hidden /> Imagen fuente
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {small && (
          <p role="note" className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1.5 text-[11px] text-amber-900">
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
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-all duration-300 ${
                dragOver ? "border-accent bg-accent/10 shadow-[inset_0_0_18px_-6px_rgba(191,25,50,0.25)]" : "border-border hover:border-foreground/40 hover:bg-accent/5"
              }`}
            >
              <motion.span
                className="inline-flex text-muted-foreground"
                animate={reduced ? undefined : dragOver ? { y: 0, scale: 1.15 } : { y: [0, -4, 0], scale: 1 }}
                transition={reduced ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <Upload className="h-7 w-7" aria-hidden />
              </motion.span>
              <p className="text-sm font-medium">Arrastra tu arte aquí o haz clic</p>
              <p className="text-[11px] text-muted-foreground">
                {appConfig.limits.image.allowedMimeTypes.join(" · ")} · máx {Math.round(appConfig.limits.image.maxUploadBytes / 1048576)} MiB ·{" "}
                {appConfig.limits.image.maxDimension}px por lado
              </p>
              <p className="text-[10px] text-muted-foreground">
                Si tu imagen supera los límites, se adapta automáticamente en tu navegador (escala + recodificación) antes de subir.
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
            <div className="space-y-3">
              <div className="vt-checker overflow-hidden rounded-md border border-border">
                <canvas ref={canvasRef} className="block h-auto w-full" aria-label="Vista de la imagen fuente" style={{ maxHeight: 260 }} />
              </div>
              {/* FIX-2b: una columna (label izq · valor der). Con grid-cols-2 el
                  valor "1636×2752" desbordaba su celda e invadía la columna
                  vecina ("Peso") — colisión de texto real medida en E2E. */}
              <dl className="grid grid-cols-1 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <div className="flex justify-between gap-2"><dt>Dimensiones</dt><dd className="tabular-nums">{source.width}×{source.height}</dd></div>
                <div className="flex justify-between gap-2"><dt>Peso</dt><dd className="tabular-nums">{(source.bytes / 1024).toFixed(0)} KiB</dd></div>
                <div className="flex justify-between gap-2"><dt>MIME</dt><dd>{source.mimeType}</dd></div>
                <div className="flex justify-between gap-2"><dt>sha-256</dt><dd title={source.checksum} className="truncate">{source.checksum.slice(0, 10)}…</dd></div>
              </dl>
              <div className="flex flex-wrap items-center gap-1.5">
                {source.bgApplied ? <OkChip>Fondo eliminado · reversible (Ctrl+Z)</OkChip> : hasAlpha ? <OkChip>Alfa nativo</OkChip> : null}
                <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={bgBusy}>
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
          <Card className="border-border/70 bg-secondary/40">
            <CardHeader className="px-3 py-2">
              <CardTitle className="flex items-center gap-1.5 text-xs font-semibold">
                <Eraser className="h-3.5 w-3.5" aria-hidden /> Quitar fondo
                {op?.metadata?.licencia === "pending-audit" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-normal text-amber-700">
                    <ShieldAlert className="h-3 w-3" aria-hidden /> licencia pendiente de auditoría
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-3 pb-3">
              <div className="space-y-1.5">
                <Label htmlFor="bg-op" className="text-[11px]">Motor</Label>
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="bg-tol" className="text-[11px]">Tolerancia</Label>
                  <span className="font-mono text-[11px] tabular-nums">{tolerance} %</span>
                </div>
                <Slider id="bg-tol" value={[tolerance]} min={0} max={100} step={1} onValueChange={(v) => setTolerance(v[0] ?? tolerance)} disabled={bgBusy} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="bg-feather" className="text-[11px]">Suavizar borde (1 px)</Label>
                <Switch id="bg-feather" checked={feather} onCheckedChange={setFeather} disabled={bgBusy} />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={bgBusy || small}
                onClick={() => {
                  void runBgRemoval(engineId, { tolerance, feather }).then(() => undefined, (e) => {
                    toast.error("El motor de fondo devolvió un problema", { description: e instanceof Error ? e.message : undefined });
                  });
                }}
              >
                <Eraser className="mr-1 h-3.5 w-3.5" aria-hidden /> Quitar fondo en el navegador
              </Button>
              <ProgressLine percent={bgPercent} phase={bgPhase} />
              <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                La máscara alfa no se persiste: es un paso local y reversible antes de vectorizar (ADR-009).
              </p>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
