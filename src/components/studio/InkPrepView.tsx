"use client";

/**
 * VectorTinta — Vista Preparación de tintas (plan §1.1 punto 6).
 *
 * Una TARJETA por capa (design v3: la tabla de 7 columnas no cabía en el
 * panel central sin scroll horizontal; las tarjetas fluyen a cualquier
 * ancho). Cada tarjeta lleva: marca de tinta única (patrón de
 * configuración), color HEX + nombre, área cubierta (px y %), archivo de
 * exportación que TENDRÁ dentro del ZIP (patrón
 * {orden:02d}-{colorHex}-{layerId}.svg) y visibilidad. El orden de impresión
 * se DERIVA de la estrategia de configuración (export.printOrderStrategy):
 * by-area-desc = mayor cobertura primero; by-lightness = tintas claras
 * primero (clásico serigráfico).
 */
import * as React from "react";
import { Droplets, ListOrdered } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { appConfig } from "@/lib/config/app.config";
import { relativeLightness } from "@/lib/domain/invariants";
import { renderFilePattern, renderInkMark } from "@/lib/registries/formats/manifests";
import type { ClientLayer } from "@/lib/state/types";
import { useStudio } from "@/lib/state/store";
import { cn } from "@/lib/utils";
import { ColorSwatch, EmptyState, PanelStates } from "@/components/studio/molecules";
import { DUR, EASE, SPRING } from "@/lib/motion";

/** Celda de nombre: confirma al desenfocar o pulsar Enter (un commit, un comando). */
function NameCell({ layer, onCommit }: { layer: ClientLayer; onCommit: (name: string) => void }) {
  const [draft, setDraft] = React.useState(layer.name);
  React.useEffect(() => setDraft(layer.name), [layer.name, layer.id]);
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() !== "" && draft !== layer.name) onCommit(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      aria-label={`Nombre de la tinta ${layer.name}`}
      className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 text-xs font-medium hover:border-input focus-visible:bg-card"
    />
  );
}

/** Celda HEX: confirma al desenfocar solo si es un color plano válido. */
function HexCell({ layer, onCommit }: { layer: ClientLayer; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = React.useState(layer.colorHex);
  React.useEffect(() => setDraft(layer.colorHex), [layer.colorHex, layer.id]);
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value.toUpperCase())}
      onBlur={() => {
        const hex = draft.trim().toUpperCase();
        if (/^#[0-9A-F]{6}$/.test(hex) && hex !== layer.colorHex) onCommit(hex);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      aria-label={`HEX de la tinta ${layer.name}`}
      className="h-7 w-[76px] shrink-0 border-transparent bg-secondary/50 px-1.5 font-mono text-[11px] hover:border-input focus-visible:bg-card"
    />
  );
}

export function InkPrepView() {
  const layers = useStudio((s) => s.layers);
  const source = useStudio((s) => s.source);
  const workspaceStatus = useStudio((s) => s.workspaceStatus);
  const toggleVisible = useStudio((s) => s.toggleVisible);
  const recolorLayer = useStudio((s) => s.recolorLayer);
  const renameLayer = useStudio((s) => s.renameLayer);
  const selectedLayerId = useStudio((s) => s.selectedLayerId);
  const selectLayer = useStudio((s) => s.selectLayer);
  const reduced = useReducedMotion();

  const totalPx = source !== null ? source.width * source.height : 0;
  const strategy = appConfig.export.printOrderStrategy;

  const { printOrder, excluded } = React.useMemo(() => {
    const visibles = layers.filter((l) => l.visible);
    const ordenadas =
      strategy === "by-lightness"
        ? [...visibles].sort((a, b) => relativeLightness(a.colorHex) - relativeLightness(b.colorHex) || a.orden - b.orden)
        : [...visibles].sort((a, b) => b.areaPx - a.areaPx || a.orden - b.orden);
    return {
      printOrder: ordenadas.map((l, order) => ({ layer: l, order })),
      excluded: layers.filter((l) => !l.visible),
    };
  }, [layers, strategy]);

  const status = layers.length === 0 ? "empty" : workspaceStatus;

  return (
    <Card className="vt-panel flex min-h-0 flex-1 flex-col">
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Droplets className="size-4 text-[var(--vt-copper)]" aria-hidden /> Preparación de tintas
          </span>
          <Badge variant="outline" className="gap-1 border-border bg-secondary/60 font-mono text-[10px] font-normal text-muted-foreground">
            <ListOrdered className="size-3" aria-hidden /> estrategia: {strategy}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <PanelStates
          ariaLabel="Preparación de tintas"
          status={status}
          empty={
            <EmptyState
              icon={Droplets}
              title="Sin tintas que preparar"
              hint="Vectoriza la imagen fuente y aquí verás una fila por tinta con su marca, cobertura y archivo de fotolito."
            />
          }
        >
          <div className="vt-scroll -mr-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
            {printOrder.map(({ layer, order }, idx) => {
              const coverage = totalPx > 0 ? (layer.areaPx / totalPx) * 100 : 0;
              const selected = selectedLayerId === layer.id;
              const fileName = renderFilePattern(order, layer.colorHex, layer.id);
              return (
                <motion.div
                  key={layer.id}
                  onClick={() => selectLayer(layer.id)}
                  className={cn(
                    // shrink-0: la tarjeta conserva su altura natural dentro
                    // del contenedor flex acotado (patrón de la fila de capa).
                    "relative shrink-0 cursor-pointer overflow-hidden rounded-lg border px-3 py-2 transition-colors",
                    selected
                      ? "border-[var(--vt-copper)]/50 bg-[var(--vt-copper-soft)]"
                      : "border-border/70 bg-card/60 hover:border-foreground/20 hover:bg-secondary/40",
                  )}
                  aria-current={selected ? "true" : undefined}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.base, ease: EASE.signature, delay: reduced ? 0 : Math.min(idx * 0.05, 0.35) }}
                >
                  {selected && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[var(--vt-copper)]" />}
                  {/* Línea 1: orden · marca · tinta (swatch+nombre+hex) · visibilidad */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                      {String(order).padStart(2, "0")}
                    </span>
                    <motion.code
                      key={layer.colorHex}
                      initial={reduced ? false : { scale: 0.9, opacity: 0.6 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SPRING.pop}
                      className="shrink-0 rounded border border-border bg-secondary/70 px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      {renderInkMark(order, layer.colorHex)}
                    </motion.code>
                    <ColorSwatch hex={layer.colorHex} size={18} />
                    <NameCell layer={layer} onCommit={(name) => renameLayer(layer.id, name)} />
                    <HexCell layer={layer} onCommit={(hex) => recolorLayer(layer.id, hex)} />
                    <Switch
                      checked={layer.visible}
                      onCheckedChange={(v) => toggleVisible(layer.id, v)}
                      aria-label={`Visibilidad de la tinta ${layer.name}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {/* Línea 2: cobertura (barra+%) · área · archivo en ZIP */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 font-mono text-[10px] text-muted-foreground">
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <motion.span
                          className="block h-full w-full rounded-full"
                          style={{ backgroundColor: layer.colorHex, transformOrigin: "left" }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: Math.min(1, Math.max(0, coverage / 100)) }}
                          transition={SPRING.bar}
                        />
                      </span>
                      <span className="tabular-nums">{Math.round(coverage * 100) / 100} %</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{layer.areaPx.toLocaleString("es")} px²</span>
                    <span className="min-w-0 flex-1 truncate" title={fileName}>
                      {fileName}
                    </span>
                  </div>
                </motion.div>
              );
            })}
            {excluded.map((layer) => (
              <div key={layer.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 opacity-50">
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">—</span>
                <span className="shrink-0 rounded border border-border bg-secondary/70 px-1.5 py-0.5 font-mono text-[11px]">excluida (oculta)</span>
                <ColorSwatch hex={layer.colorHex} size={16} />
                <span className="min-w-0 flex-1 truncate text-xs">{layer.name}</span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{layer.areaPx.toLocaleString("es")} px²</span>
                <Switch
                  checked={layer.visible}
                  onCheckedChange={(v) => toggleVisible(layer.id, v)}
                  aria-label={`Visibilidad de la tinta ${layer.name}`}
                />
              </div>
            ))}
            <p className="p-2 text-[11px] leading-relaxed text-muted-foreground">
              {printOrder.length} tinta(s) imprimirán en este orden según la estrategia <code className="font-mono">{strategy}</code> de configuración; las capas ocultas quedan fuera del ZIP y constan en el manifiesto como excluidas. Los archivos se llaman según el patrón{" "}
              <code className="font-mono">{appConfig.export.filePattern}</code>.
            </p>
          </div>
        </PanelStates>
      </CardContent>
    </Card>
  );
}
