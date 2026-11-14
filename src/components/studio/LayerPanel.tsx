"use client";

/**
 * VectorTinta — Panel de capas (plan §1.1 punto 5, §5.2).
 *
 * - Claves estables `key = layer.id` (nunca índices, §5.2).
 * - Arrastre de orden con dnd-kit → ReorderLayerCommand (histórico + swap PATCH).
 * - El umbral de virtualización (config: 50) no se alcanza nunca en v1
 *   (máx. 30 capas por vectorización); el guard queda por si el límite sube.
 * - Color: paleta de tintas de CONFIGURACIÓN + hex libre; el nombre de tinta
 *   se sugiere desde la paleta (invariants.suggestInkName).
 */
import * as React from "react";
import { CopyPlus, Eye, EyeOff, Focus, GripVertical, Layers, Palette } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appConfig } from "@/lib/config/app.config";
import { isValidColorHex, suggestInkName } from "@/lib/domain/invariants";
import type { ClientLayer } from "@/lib/state/types";
import { useStudio } from "@/lib/state/store";
import { cn } from "@/lib/utils";
import { ColorSwatch, EmptyState, PanelStates } from "@/components/studio/molecules";
import { motion, useReducedMotion } from "framer-motion";
import { DUR, EASE, SPRING } from "@/lib/motion";

export function LayerPanel() {
  const layers = useStudio((s) => s.layers);
  const sourceStatus = useStudio((s) => s.sourceStatus);
  const source = useStudio((s) => s.source);
  const selectedLayerId = useStudio((s) => s.selectedLayerId);
  const isolatedLayerId = useStudio((s) => s.isolatedLayerId);
  const selectLayer = useStudio((s) => s.selectLayer);
  const isolateLayer = useStudio((s) => s.isolateLayer);
  const toggleVisible = useStudio((s) => s.toggleVisible);
  const recolorLayer = useStudio((s) => s.recolorLayer);
  const renameLayer = useStudio((s) => s.renameLayer);
  const duplicateLayer = useStudio((s) => s.duplicateLayer);
  const reorderLayer = useStudio((s) => s.reorderLayer);

  const sorted = React.useMemo(() => [...layers].sort((a, b) => a.orden - b.orden), [layers]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    void reorderLayer(String(active.id), String(over.id));
  };

  const status = layers.length === 0 ? (source !== null ? "empty" : sourceStatus === "loading" ? "loading" : "empty") : "ready";

  const totalPx = source !== null ? source.width * source.height : 0;

  // FIX-2: shrink-0 — misma corrección que AssetPanel (la columna scrollea,
  // la card no se encoge: el contenido desbordaba sobre la card vecina).
  return (
    <Card className="vt-panel flex shrink-0 flex-col border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4" aria-hidden /> Capas
          </span>
          <span className="font-mono text-[11px] font-normal text-muted-foreground">
            {layers.length}/{appConfig.limits.layers.maxPerVectorization}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        <PanelStates
          ariaLabel="Capas"
          status={status}
          empty={<EmptyState icon={Layers} title="Sin capas todavía" hint="Vectoriza la imagen fuente con el preset del panel derecho y aquí aparecerá una capa por tinta." />}
        >
          {layers.length > appConfig.rendering.virtualizationThreshold ? (
            <p role="note" className="mb-1 rounded border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] text-amber-900">
              Más de {appConfig.rendering.virtualizationThreshold} capas: la lista se compacta y el arrastre se desactiva (presupuesto §5.3).
            </p>
          ) : null}
          <DndContext sensors={layers.length > appConfig.rendering.virtualizationThreshold ? [] : sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sorted.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ul className="vt-scroll flex max-h-[38vh] flex-col gap-1 overflow-y-auto pr-1 lg:max-h-none" aria-label="Lista de capas por orden de apilado">
                {sorted.map((layer) => (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    coverage={totalPx > 0 ? (layer.areaPx / totalPx) * 100 : 0}
                    selected={selectedLayerId === layer.id}
                    isolated={isolatedLayerId === layer.id}
                    onSelect={selectLayer}
                    onIsolate={isolateLayer}
                    onToggle={toggleVisible}
                    onRecolor={recolorLayer}
                    onRename={renameLayer}
                    onDuplicate={duplicateLayer}
                    dragDisabled={layers.length > appConfig.rendering.virtualizationThreshold}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </PanelStates>
      </CardContent>
    </Card>
  );
}

function LayerRow({
  layer,
  coverage,
  selected,
  isolated,
  dragDisabled,
  onSelect,
  onIsolate,
  onToggle,
  onRecolor,
  onRename,
  onDuplicate,
}: {
  layer: ClientLayer;
  coverage: number;
  selected: boolean;
  isolated: boolean;
  dragDisabled: boolean;
  onSelect: (id: string) => void;
  onIsolate: (id: string | null) => void;
  onToggle: (id: string, visible: boolean) => void;
  onRecolor: (id: string, hex: string, opts?: { name?: string }) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: layer.id, disabled: dragDisabled });
  const [nameDraft, setNameDraft] = React.useState(layer.name);
  React.useEffect(() => setNameDraft(layer.name), [layer.name]);
  const [pickOpen, setPickOpen] = React.useState(false);
  const [hexDraft, setHexDraft] = React.useState("");
  const reduced = useReducedMotion();

  const validHex = isValidColorHex(layer.colorHex);

  return (
    <motion.li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: layer.visible ? 1 : 0.55 }}
      transition={{ duration: DUR.base, ease: EASE.signature }}
      className={cn(
        "group grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-md border px-1.5 py-1.5 transition-colors",
        selected ? "border-accent bg-accent/15" : "border-border/70 bg-card hover:border-foreground/25 hover:bg-secondary/40",
        isDragging && "z-10 shadow-md",
      )}
      onClick={() => onSelect(layer.id)}
      aria-current={selected ? "true" : undefined}
    >
      <button
        type="button"
        className="vt-hit cursor-grab touch-none rounded p-1 text-muted-foreground/70 hover:text-foreground disabled:cursor-not-allowed"
        aria-label={`Arrastrar para reordenar la capa ${layer.name}`}
        disabled={dragDisabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <Popover open={pickOpen} onOpenChange={setPickOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Color de la capa: ${layer.colorHex}. Ábrelo para elegir tinta de la paleta`}
            className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <motion.span
              key={layer.colorHex}
              className="inline-flex"
              initial={reduced ? false : { scale: 0.45, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={SPRING.pop}
            >
              <ColorSwatch hex={validHex ? layer.colorHex : appConfig.rendering.fallbackColorHex} size={20} />
            </motion.span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2" aria-label="Paleta de tintas del taller">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Palette className="h-3 w-3" aria-hidden /> Tintas del taller (configuración)
          </p>
          <div className="grid grid-cols-6 gap-1">
            {appConfig.colors.inkPalette.map((ink) => (
              <button
                key={ink.hex}
                type="button"
                className="rounded p-0.5 hover:scale-110 transition-transform"
                title={`${ink.name} · ${ink.hex}`}
                aria-label={`Aplicar ${ink.name} ${ink.hex}`}
                onClick={() => {
                  const sugerido = suggestInkName(ink.hex, layer.orden);
                  onRecolor(layer.id, ink.hex, sugerido !== layer.name ? { name: sugerido } : undefined);
                  setPickOpen(false);
                }}
              >
                <ColorSwatch hex={ink.hex} size={22} title={ink.name} />
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const hex = hexDraft.trim().toUpperCase();
              if (isValidColorHex(hex)) {
                const sugerido = suggestInkName(hex, layer.orden);
                onRecolor(layer.id, hex, sugerido !== layer.name ? { name: sugerido } : undefined);
                setHexDraft("");
                setPickOpen(false);
              }
            }}
          >
            <Input
              value={hexDraft}
              onChange={(e) => setHexDraft(e.target.value)}
              placeholder="#RRGGBB"
              aria-label="Color libre en formato HEX"
              className="h-7 font-mono text-[11px]"
            />
            <Button type="submit" size="sm" className="h-7 px-2 text-[11px]">
              Aplicar
            </Button>
          </form>
          {!validHex && (
            <p role="alert" className="mt-1.5 text-[10px] text-destructive">
              colorHex inválido en datos: se muestra el magenta de rescate ({appConfig.rendering.fallbackColorHex}).
            </p>
          )}
        </PopoverContent>
      </Popover>

      {/* FIX-2c: grid de 2 filas — nombre con elipsis y la línea de
          estadísticas ocupando el ANCHO COMPLETO de la fila (antes vivía
          atrapada en la columna central de ~100px: "789.093 px²" se truncaba
          perdiendo la unidad). Tooltip con los valores exactos. */}
      <Input
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        onBlur={() => {
          if (nameDraft !== layer.name && nameDraft.trim() !== "") onRename(layer.id, nameDraft.trim());
        }}
        aria-label={`Nombre de la capa ${layer.orden}`}
        title={nameDraft}
        className="h-6 min-w-0 truncate border-transparent bg-transparent px-1 text-xs font-medium hover:border-input focus-visible:bg-card"
      />

      <div className="flex items-center opacity-80 transition-opacity group-hover:opacity-100">
        <Button
          size="icon"
          className="vt-hit size-7"
          variant={isolated ? "default" : "ghost"}
          aria-label={isolated ? `Salir del aislamiento de ${layer.name}` : `Aislar solo la capa ${layer.name}`}
          aria-pressed={isolated}
          onClick={(e) => {
            e.stopPropagation();
            onIsolate(isolated ? null : layer.id);
          }}
        >
          <Focus className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="icon"
          className="vt-hit size-7"
          variant="ghost"
          aria-label={layer.visible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(layer.id, !layer.visible);
          }}
        >
          {layer.visible ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
        </Button>
        <Button
          size="icon"
          className="vt-hit size-7"
          variant="ghost"
          aria-label={`Duplicar ${layer.name} como nueva tinta`}
          disabled={layer.orden >= appConfig.limits.layers.maxPerVectorization - 1}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(layer.id);
          }}
        >
          <CopyPlus className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <div
        className="col-span-4 mt-0.5 flex items-center gap-1.5 px-0.5 font-mono text-[10px] text-muted-foreground"
        title={`Orden ${layer.orden.toString().padStart(2, "0")} · ${Math.round(coverage * 10) / 10} % · ${layer.areaPx.toLocaleString("es")} px²`}
      >
        <span className="shrink-0 tabular-nums">{layer.orden.toString().padStart(2, "0")}</span>
        <span className="shrink-0 tabular-nums">{Math.round(coverage * 10) / 10} %</span>
        <span className="min-w-0 truncate tabular-nums">{layer.areaPx.toLocaleString("es")} px²</span>
      </div>
    </motion.li>
  );
}
