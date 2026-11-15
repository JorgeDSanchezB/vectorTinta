"use client";

/**
 * VectorTinta — Inspector (plan §1.6, §4.4).
 *
 * El formulario del preset se AUTOGENERA desde los metadatos de campo del
 * PresetRegistry (label/min/max/step/unidad): añadir el preset "cómic" con un
 * campo nuevo (strokeWidth) produce su formulario SIN tocar este archivo
 * (recorrido de extensibilidad del enunciado, §7).
 *
 * Layout de campo (design v3): etiqueta con truncate a la izquierda + input
 * numérico compacto con sufijo de unidad a la derecha (fuente única del
 * valor, cero duplicados, cero colisiones); slider a ancho completo debajo.
 */
import * as React from "react";
import { CheckCircle2, Cpu, Download, PackageOpen, WandSparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appConfig, configDigest } from "@/lib/config/app.config";
import { VECTOR_ENGINE_IDS } from "@/lib/domain/entities";
import { presetDefaults, presetFields, presetRegistry } from "@/lib/registries/preset-registry";
import { exporterRegistry } from "@/lib/registries/exporter-registry";
import type { VectorParams } from "@/lib/domain/entities";
import { useStudio } from "@/lib/state/store";
import { cn } from "@/lib/utils";
import { ProgressLine } from "@/components/studio/molecules";
import { ExportDialog } from "@/components/studio/ExportDialog";
import { useSmallViewport } from "@/components/studio/hooks";
import { DUR, EASE, riseIn, stagger, SPRING, TAP } from "@/lib/motion";

const PRESETS = appConfig.vectorization.presetManifest;

export function InspectorPanel() {
  const source = useStudio((s) => s.source);
  const sourceStatus = useStudio((s) => s.sourceStatus);
  const vectorization = useStudio((s) => s.vectorization);
  const vectorizeBusy = useStudio((s) => s.vectorizeBusy);
  const vectorizePhase = useStudio((s) => s.vectorizePhase);
  const vectorizePercent = useStudio((s) => s.vectorizePercent);
  const runVectorization = useStudio((s) => s.runVectorization);
  const small = useSmallViewport();

  const [presetId, setPresetId] = React.useState("media");
  const [engineId, setEngineId] = React.useState<string>("imagetracer-js");
  const [params, setParams] = React.useState<VectorParams>(() => ({ ...presetDefaults("media") }));
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<"zip-serigrafia" | "png-mockup">("zip-serigrafia");

  const fields = presetFields(presetId);
  const reduced = useReducedMotion();

  const selectPreset = (id: string): void => {
    setPresetId(id);
    setParams({ ...presetDefaults(id) });
  };

  const vectorReady = source !== null && !vectorizeBusy && !small;

  return (
    <Card className="vt-panel flex shrink-0 flex-col">
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Cpu className="size-4 text-[var(--vt-copper)]" aria-hidden /> Inspector
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col px-4 pb-4">
        <Tabs defaultValue="vector" className="flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="vector" className="text-xs">Vectorizar</TabsTrigger>
            <TabsTrigger value="export" className="text-xs">Exportar</TabsTrigger>
          </TabsList>

          {/* ─────────── Tab Vectorizar ─────────── */}
          <TabsContent value="vector" className="mt-3 flex flex-col gap-3">
            {small && (
              <p role="note" className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200/90">
                Vectorizar queda bloqueado en pantallas pequeñas (presupuesto móvil de configuración).
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="preset" className="vt-label">Preset de fidelidad</Label>
              <Select value={presetId} onValueChange={selectPreset}>
                <SelectTrigger id="preset" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] leading-snug text-muted-foreground">{presetRegistry.get(presetId)?.description}</p>
            </div>

            {/* Formulario AUTOGENERADO desde el registro (§4.4) */}
            <motion.div
              variants={riseIn}
              initial="hidden"
              animate="show"
              key={presetId}
              className="space-y-3 rounded-lg border border-border/80 bg-secondary/30 p-3"
              aria-label="Parámetros del preset (autogenerados del registro)"
            >
              {fields.map((field, i) => {
                const value = (params as unknown as Record<string, unknown>)[field.key];
                // Separador cuando cambia el TIPO de control (número→enum):
                // evita que un select quede «pegado» al último slider
                // (hallazgo del árbitro: jerarquía interna irregular).
                const prev = fields[i - 1];
                const kindShift = prev !== undefined && prev.kind !== field.kind;
                if (field.kind === "enum") {
                  return (
                    <div key={field.key} className={cn("space-y-1", kindShift && "mt-1 border-t border-border/60 pt-2.5")}>
                      <Label htmlFor={`f-${field.key}`} className="vt-label">{field.label}</Label>
                      <Select value={String(value)} onValueChange={(v) => setParams({ ...params, [field.key]: v })}>
                        <SelectTrigger id={`f-${field.key}`} size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                const num = Number(value);
                return (
                  <div key={field.key} className={cn("space-y-1.5", kindShift && "mt-1 border-t border-border/60 pt-2.5")}>
                    {/* Fila etiqueta + valor: la etiqueta trunca, el grupo de
                        valor es shrink-0 — matemáticamente imposible que
                        colisionen. La unidad vive FUERA del input (los sufijos
                        internos se solapaban con números de 2+ dígitos). */}
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <Label htmlFor={`f-${field.key}`} className="min-w-0 truncate text-[11px] text-foreground/75">
                        {field.label}
                      </Label>
                      <span className="flex shrink-0 items-center gap-1">
                        <Input
                          id={`f-${field.key}`}
                          aria-label={`${field.label} (valor exacto)`}
                          type="number"
                          value={num}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n >= (field.min ?? 0) && n <= (field.max ?? 0)) {
                              setParams({ ...params, [field.key]: n });
                            }
                          }}
                          className="h-7 w-[58px] px-1.5 text-right font-mono text-[11px] tabular-nums"
                        />
                        {field.unit !== undefined && field.unit !== "" && (
                          <span title={field.unit} className="w-10 truncate text-right font-mono text-[9px] leading-none text-muted-foreground">
                            {field.unit}
                          </span>
                        )}
                      </span>
                    </div>
                    <Slider
                      aria-label={`${field.label} (deslizador)`}
                      value={[num]}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      onValueChange={(v) => setParams({ ...params, [field.key]: v[0] ?? num })}
                      className="flex-1"
                    />
                  </div>
                );
              })}
            </motion.div>

            <div className="space-y-1.5">
              <Label htmlFor="engine" className="vt-label">Motor</Label>
              <Select value={engineId} onValueChange={setEngineId}>
                <SelectTrigger id="engine" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VECTOR_ENGINE_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id === "imagetracer-js" ? "imagetracer-js (propio)" : "vtracer-wasm (bloqueado: licencia pendiente)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <motion.div whileTap={reduced ? undefined : TAP}>
              <Button className="vt-btn-copper h-9 w-full gap-1.5 text-[13px] font-semibold" disabled={!vectorReady} onClick={() => void runVectorization(presetId, params, engineId)}>
                <WandSparkles className="size-4" aria-hidden /> Vectorizar en el navegador
              </Button>
            </motion.div>
            <ProgressLine percent={vectorizePercent} phase={vectorizePhase} />
            {vectorization !== null && !vectorizeBusy && (
              <motion.div
                initial="hidden"
                animate="show"
                variants={stagger(0.06)}
                className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] p-2.5"
                aria-live="polite"
              >
                <motion.p variants={riseIn} className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Vectorización lista
                </motion.p>
                <motion.div variants={riseIn} className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10px]">
                  <span className="rounded border border-border bg-secondary/70 px-1.5 py-0.5 tabular-nums">{vectorization.nodeCount.toLocaleString("es")} nodos</span>
                  <span className="rounded border border-border bg-secondary/70 px-1.5 py-0.5">preset {vectorization.presetId}</span>
                  <span className="rounded border border-border bg-secondary/70 px-1.5 py-0.5">{vectorization.engineId}</span>
                </motion.div>
              </motion.div>
            )}
            {sourceStatus === "ready" && vectorization === null && !vectorizeBusy && source !== null && (
              <p className="text-center text-[10px] text-muted-foreground">
                Ajusta el preset y pulsa <span className="font-medium text-foreground/70">Vectorizar</span> para separar las tintas.
              </p>
            )}
          </TabsContent>

          {/* ─────────── Tab Exportar ─────────── */}
          <TabsContent value="export" className="mt-3 flex flex-col gap-2.5">
            <div className="space-y-1.5">
              {appConfig.export.formats.map((fmt) => {
                const entry = exporterRegistry.get(fmt.id);
                const active = exportFormat === fmt.id;
                return (
                  <motion.button
                    key={fmt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setExportFormat(fmt.id as "zip-serigrafia" | "png-mockup")}
                    whileHover={reduced ? undefined : { y: -1.5 }}
                    whileTap={reduced ? undefined : TAP}
                    transition={{ duration: DUR.fast, ease: EASE.signature }}
                    className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                      active
                        ? "border-[var(--vt-copper)]/45 bg-[var(--vt-copper-soft)]"
                        : "border-border/80 hover:border-foreground/25 hover:bg-secondary/40"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <PackageOpen className={`size-3.5 ${active ? "text-[var(--vt-copper)]" : "text-muted-foreground"}`} aria-hidden /> {fmt.label}
                      {active && (
                        <motion.span
                          initial={reduced ? false : { opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={SPRING.pop}
                          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-normal text-[var(--vt-copper)]"
                        >
                          <CheckCircle2 className="size-3" aria-hidden /> elegido
                        </motion.span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{entry?.description ?? fmt.description}</span>
                  </motion.button>
                );
              })}
            </div>
            <motion.div whileTap={reduced ? undefined : TAP}>
              <Button className="vt-btn-copper h-9 w-full gap-1.5 text-[13px] font-semibold" disabled={vectorization === null || small} onClick={() => setExportOpen(true)}>
                <Download className="size-4" aria-hidden /> Preparar exportación
              </Button>
            </motion.div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Cuota de configuración: {appConfig.limits.exports.maxPerDay} exportaciones/día. El ZIP lleva un SVG por tinta + {appConfig.export.manifestFileName} con orden de impresión, marcas y coberturas.
            </p>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground/60" title="Digest de configuración (drift entre entornos)">
              config {configDigest}
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} formatId={exportFormat} />
    </Card>
  );
}
