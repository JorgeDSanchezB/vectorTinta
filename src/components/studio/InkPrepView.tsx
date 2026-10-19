"use client";

/**
 * VectorTinta — Vista Preparación de tintas (plan §1.1 punto 6).
 *
 * Una fila por capa con: marca de tinta única (patrón de configuración),
 * color HEX + nombre, área cubierta (px y %), archivo de exportación que
 * TENDRÁ dentro del ZIP (patrón {orden:02d}-{colorHex}-{layerId}.svg) y
 * visibilidad. El orden de impresión se DERIVA de la estrategia de
 * configuración (export.printOrderStrategy): by-area-desc = mayor cobertura
 * primero; by-lightness = tintas claras primero (clásico serigráfico).
 */
import * as React from "react";
import { Droplets, ListOrdered } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { appConfig } from "@/lib/config/app.config";
import { relativeLightness } from "@/lib/domain/invariants";
import { renderFilePattern, renderInkMark } from "@/lib/registries/formats/manifests";
import type { ClientLayer } from "@/lib/state/types";
import { useStudio } from "@/lib/state/store";
import { ColorSwatch, EmptyState, PanelStates } from "@/components/studio/molecules";

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
      className="h-7 w-32 border-transparent bg-transparent px-1 text-xs hover:border-input focus-visible:bg-card"
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
      className="h-7 w-24 font-mono text-[11px]"
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
    <Card className="flex min-h-0 flex-1 flex-col border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Droplets className="h-4 w-4" aria-hidden /> Preparación de tintas
          </span>
          <Badge variant="outline" className="gap-1 border-border bg-secondary font-mono text-[10px] font-normal">
            <ListOrdered className="h-3 w-3" aria-hidden /> estrategia: {strategy}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
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
          <div className="vt-scroll min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10 text-[11px]">Nº</TableHead>
                  <TableHead className="text-[11px]">Marca de tinta</TableHead>
                  <TableHead className="text-[11px]">Tinta</TableHead>
                  <TableHead className="text-[11px]">Cobertura</TableHead>
                  <TableHead className="text-[11px]">Área</TableHead>
                  <TableHead className="text-[11px]">Archivo en ZIP</TableHead>
                  <TableHead className="w-14 text-[11px]">Visible</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printOrder.map(({ layer, order }) => {
                  const coverage = totalPx > 0 ? (layer.areaPx / totalPx) * 100 : 0;
                  const selected = selectedLayerId === layer.id;
                  return (
                    <TableRow
                      key={layer.id}
                      onClick={() => selectLayer(layer.id)}
                      className={`cursor-pointer ${selected ? "bg-accent/10" : ""}`}
                      aria-current={selected ? "true" : undefined}
                    >
                      <TableCell className="font-mono text-xs tabular-nums">{String(order).padStart(2, "0")}</TableCell>
                      <TableCell>
                        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{renderInkMark(order, layer.colorHex)}</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <ColorSwatch hex={layer.colorHex} size={20} />
                          <NameCell layer={layer} onCommit={(name) => renameLayer(layer.id, name)} />
                          <HexCell layer={layer} onCommit={(hex) => recolorLayer(layer.id, hex)} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, coverage)}%` }} />
                          </div>
                          <span className="font-mono text-[11px] tabular-nums">{Math.round(coverage * 100) / 100} %</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] tabular-nums">{layer.areaPx.toLocaleString("es")} px²</TableCell>
                      <TableCell>
                        <code className="break-all font-mono text-[10px] text-muted-foreground">{renderFilePattern(order, layer.colorHex, layer.id)}</code>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={layer.visible}
                          onCheckedChange={(v) => toggleVisible(layer.id, v)}
                          aria-label={`Visibilidad de la tinta ${layer.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {excluded.map((layer) => (
                  <TableRow key={layer.id} className="opacity-50">
                    <TableCell className="font-mono text-xs">—</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">excluida (oculta)</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <ColorSwatch hex={layer.colorHex} size={16} />
                        <span className="text-xs">{layer.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">no se imprime</TableCell>
                    <TableCell className="font-mono text-[11px] tabular-nums">{layer.areaPx.toLocaleString("es")} px²</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">—</TableCell>
                    <TableCell>
                      <Switch
                        checked={layer.visible}
                        onCheckedChange={(v) => toggleVisible(layer.id, v)}
                        aria-label={`Visibilidad de la tinta ${layer.name}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
              {printOrder.length} tinta(s) imprimirán en este orden según la estrategia <code className="font-mono">{strategy}</code> de configuración; las capas ocultas quedan fuera del ZIP y constan en el manifiesto como excluidas. Los archivos se llaman según el patrón{" "}
              <code className="font-mono">{appConfig.export.filePattern}</code>.
            </p>
          </div>
        </PanelStates>
      </CardContent>
    </Card>
  );
}
