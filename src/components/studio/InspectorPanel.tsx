"use client";

/**
 * VectorTinta — Inspector (plan §1.6, §4.4).
 *
 * El formulario del preset se AUTOGENERA desde los metadatos de campo del
 * PresetRegistry (label/min/max/step/unidad): añadir el preset "cómic" con un
 * campo nuevo (strokeWidth) produce su formulario SIN tocar este archivo
 * (recorrido de extensibilidad del enunciado, §7).
 */
import * as React from "react";
import { Cpu, Download, PackageOpen, WandSparkles } from "lucide-react";
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
import { OkChip, PanelStates, ProgressLine } from "@/components/studio/molecules";
import { ExportDialog } from "@/components/studio/ExportDialog";
import { useSmallViewport } from "@/components/studio/hooks";

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

  const selectPreset = (id: string): void => {
    setPresetId(id);
    setParams({ ...presetDefaults(id) });
  };

  const vectorReady = source !== null && !vectorizeBusy && !small;

  return (
    <Card className="flex min-h-0 flex-col border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Cpu className="h-4 w-4" aria-hidden /> Inspector
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Tabs defaultValue="vector" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="vector">Vectorizar</TabsTrigger>
            <TabsTrigger value="export">Exportar</TabsTrigger>
          </TabsList>

          {/* ─────────── Tab Vectorizar ─────────── */}
          <TabsContent value="vector" className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
            {small && (
              <p role="note" className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1.5 text-[11px] text-amber-900">
                Vectorizar queda bloqueado en pantallas pequeñas (presupuesto móvil de configuración).
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="preset" className="text-[11px]">Preset de fidelidad</Label>
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
            <div className="space-y-2.5 rounded-md border border-border/70 bg-secondary/30 p-2.5" aria-label="Parámetros del preset (autogenerados del registro)">
              {fields.map((field) => {
                const value = (params as unknown as Record<string, unknown>)[field.key];
                if (field.kind === "enum") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label htmlFor={`f-${field.key}`} className="text-[11px]">{field.label}</Label>
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
                  <div key={field.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`f-${field.key}`} className="text-[11px]">{field.label}</Label>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {num} {field.unit ?? ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        id={`f-${field.key}`}
                        value={[num]}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        onValueChange={(v) => setParams({ ...params, [field.key]: v[0] ?? num })}
                        className="flex-1"
                      />
                      <Input
                        aria-label={`${field.label} exacto`}
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
                        className="h-7 w-16 font-mono text-[11px]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="engine" className="text-[11px]">Motor</Label>
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

            <Button className="w-full" disabled={!vectorReady} onClick={() => void runVectorization(presetId, params, engineId)}>
              <WandSparkles className="mr-1 h-4 w-4" aria-hidden /> Vectorizar en el navegador
            </Button>
            <ProgressLine percent={vectorizePercent} phase={vectorizePhase} />
            {vectorization !== null && !vectorizeBusy && (
              <div className="flex flex-wrap gap-1.5">
                <OkChip>{vectorization.nodeCount.toLocaleString("es")} nodos</OkChip>
                <OkChip>preset {vectorization.presetId}</OkChip>
                <OkChip>{vectorization.engineId}</OkChip>
              </div>
            )}
            <PanelStates
              status={sourceStatus === "ready" && vectorization === null ? "empty" : "ready"}
              empty={<p className="text-center text-[11px] text-muted-foreground">Aún no hay vectorización en este proyecto.</p>}
            >
              <span className="sr-only">Estado listo</span>
            </PanelStates>
          </TabsContent>

          {/* ─────────── Tab Exportar ─────────── */}
          <TabsContent value="export" className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
            <div className="space-y-1.5">
              {appConfig.export.formats.map((fmt) => {
                const entry = exporterRegistry.get(fmt.id);
                const active = exportFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setExportFormat(fmt.id as "zip-serigrafia" | "png-mockup")}
                    className={`w-full rounded-md border p-2 text-left transition-colors ${active ? "border-accent bg-accent/5" : "border-border/70 hover:border-foreground/25"}`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <PackageOpen className="h-3.5 w-3.5" aria-hidden /> {fmt.label}
                      {active && <span className="ml-auto font-mono text-[10px] text-accent">elegido</span>}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">{entry?.description ?? fmt.description}</span>
                  </button>
                );
              })}
            </div>
            <Button className="w-full" disabled={vectorization === null || small} onClick={() => setExportOpen(true)}>
              <Download className="mr-1 h-4 w-4" aria-hidden /> Preparar exportación
            </Button>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Cuota de configuración: {appConfig.limits.exports.maxPerDay} exportaciones/día. El ZIP lleva un SVG por tinta + {appConfig.export.manifestFileName} con orden de impresión, marcas y coberturas.
            </p>
            <p className="mt-auto font-mono text-[9px] text-muted-foreground/70" title="Digest de configuración (drift entre entornos)">
              config {configDigest}
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} formatId={exportFormat} />
    </Card>
  );
}
