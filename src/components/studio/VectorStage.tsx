"use client";

/**
 * VectorTinta — Lienzo SVG nativo (ADR-002, plan §5.2/§5.3).
 *
 * Mecánica de rendimiento (presupuesto <100 ms declarado §5.3):
 *  - Los fragmentos de capa se inlinean UNA vez por cambio estructural
 *    (`layersVersion`); recolor/visibilidad/orden NO re-renderizan React:
 *    se aplican por mutación directa del DOM (refs a cada <g data-layer-id>).
 *  - Selección: hit-test nativo `closest('[data-layer-id]')` (O(profundidad)).
 *  - Zoom/pan: transform CSS del contenedor; no toca el árbol SVG.
 *  - Aislar: display del resto (O(n capas), n ≤ 30).
 *  - colorHex inválido en datos leídos → magenta de rescate de configuración
 *    (rendering.fallbackColorHex) que DENUNCIA el problema (§5.2), nunca un
 *    color parecido en silencio.
 */
import * as React from "react";
import { Crosshair, Maximize2, Minus, Plus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/config/app.config";
import { isValidColorHex } from "@/lib/domain/invariants";
import { fragmentInner } from "@/lib/state/slices/project";
import { useStudio } from "@/lib/state/store";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/studio/molecules";
import { SPRING, REVEAL, PULSE_MS } from "@/lib/motion";
import { Image as ImageIcon } from "lucide-react";

/**
 * Grupo de capa MEMOIZADO (§5.3): el fragmento se inlinea UNA vez por cambio
 * estructural; los recolores/undo/redo re-renderizan VectorStage pero NO este
 * componente (props estables por valor), de modo que React jamás reescribe el
 * innerHTML y las mutaciones imperativas (fill/display/orden) persisten.
 */
const LayerGroup = React.memo(function LayerGroup({
  id,
  inner,
  register,
}: {
  id: string;
  inner: string;
  register: (id: string, el: SVGGElement | null) => void;
}) {
  return <g data-layer-id={id} ref={(el) => register(id, el)} dangerouslySetInnerHTML={{ __html: inner }} />;
});

interface LayerDomState {
  colorHex: string;
  visible: boolean;
  orden: number;
}

export function VectorStage() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const groupRefs = React.useRef(new Map<string, SVGGElement>());
  const appliedRef = React.useRef<Map<string, LayerDomState>>(new Map());

  const layers = useStudio((s) => s.layers);
  const layersVersion = useStudio((s) => s.layersVersion);
  const source = useStudio((s) => s.source);
  const zoom = useStudio((s) => s.zoom);
  const pan = useStudio((s) => s.pan);
  const selectedLayerId = useStudio((s) => s.selectedLayerId);
  const isolatedLayerId = useStudio((s) => s.isolatedLayerId);
  const setZoom = useStudio((s) => s.setZoom);
  const setPan = useStudio((s) => s.setPan);
  const selectLayer = useStudio((s) => s.selectLayer);
  const isolateLayer = useStudio((s) => s.isolateLayer);
  const view = useStudio((s) => s.view);
  const reduced = useReducedMotion();
  const reducedMotionRef = React.useRef(reduced);
  React.useEffect(() => {
    reducedMotionRef.current = reduced;
  }, [reduced]);

  const width = source?.width ?? 1024;
  const height = source?.height ?? 1024;
  const hasVectorization = layers.length > 0;

  /* Ref estable (useCallback): el LayerGroup memoizado no re-renderiza y el
     registro de nodos sobrevive a los re-renders del lienzo. */
  const registerGroupRef = React.useCallback((id: string, el: SVGGElement | null): void => {
    if (el === null) groupRefs.current.delete(id);
    else groupRefs.current.set(id, el);
  }, []);

  /* ── Momento firma: revelado escalonado de capas al terminar una vectorización.
     Mutación DIRECTA del DOM (Web Animations API): cero re-render de React y el
     LayerGroup memoizado queda intacto. Se apaga con prefers-reduced-motion. */
  const prevCountRef = React.useRef(0);

  React.useEffect(() => {
    // El contador SIEMPRE avanza, incluso si el SVG aún no existe (ARB2-3:
    // al cambiar de proyecto el 0→N del siguiente se detectaba tarde).
    const prev = prevCountRef.current;
    prevCountRef.current = layers.length;
    const svg = svgRef.current;
    if (svg === null) return;
    const grew = layers.length > prev && prev === 0 && layers.length > 0;
    if (!grew || reducedMotionRef.current) return;
    const sorted = [...layers].sort((a, b) => a.orden - b.orden);
    sorted.forEach((layer, i) => {
      const g = groupRefs.current.get(layer.id);
      if (g === undefined) return;
      g.animate(
        [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0px)" }],
        { duration: REVEAL.durMs, delay: REVEAL.baseDelayMs + i * REVEAL.staggerMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
      );
    });
  }, [layers]);

  /* ── Sincronización imperativa: color, visibilidad, orden, selección ── */
  const appliedSel = (id: string): boolean | undefined => groupRefs.current.get(id)?.getAttribute("data-selected") === "true";

  React.useEffect(() => {
    const applied = appliedRef.current;
    const sorted = [...layers].sort((a, b) => a.orden - b.orden);
    const svg = svgRef.current;
    if (svg === null) return;

    // 1) Orden de apilado (appendChild preserva los nodos, no re-parsea).
    for (const layer of sorted) {
      const g = groupRefs.current.get(layer.id);
      if (g !== undefined) svg.appendChild(g);
    }
    // 2) Diffs por capa (solo lo que cambió desde la última pasada).
    for (const layer of layers) {
      const g = groupRefs.current.get(layer.id);
      if (g === undefined) continue;
      const prev = applied.get(layer.id);
      const color = isValidColorHex(layer.colorHex) ? layer.colorHex : appConfig.rendering.fallbackColorHex;
      const visible = layer.visible && (isolatedLayerId === null || isolatedLayerId === layer.id);
      if (prev === undefined || prev.colorHex !== color || prev.visible !== visible) {
        const nodes = g.querySelectorAll("[fill]");
        nodes.forEach((node) => node.setAttribute("fill", color));
        // El fragmento inlinea atributos fill; también cubre paths con fill
        // heredado del grupo:
        if (nodes.length === 0) g.setAttribute("fill", color);
        g.style.display = visible ? "" : "none";
      }
      const sel = selectedLayerId === layer.id;
      if (prev === undefined || prev.orden !== layer.orden || appliedSel(layer.id) !== sel) {
        g.setAttribute("data-selected", sel ? "true" : "false");
      }
      applied.set(layer.id, { colorHex: color, visible, orden: layer.orden });
    }
    // 3) Selección de capas desaparecidas (re-vectorización): limpiar refs.
    for (const id of [...applied.keys()]) {
      if (!layers.some((l) => l.id === id)) {
        applied.delete(id);
        groupRefs.current.delete(id);
      }
    }
  }, [layers, isolatedLayerId, selectedLayerId]);


  const fittedRef = React.useRef<string | null>(null);
  const fit = React.useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    const z = Math.min((cw - 48) / width, (ch - 48) / height);
    const nextZoom = Math.max(0.02, Math.min(8, z));
    setZoom(nextZoom);
    setPan({ x: (cw - width * nextZoom) / 2, y: (ch - height * nextZoom) / 2 });
  }, [width, height, setZoom, setPan]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const key = `${width}x${height}`;
    if (fittedRef.current === key) return;
    fittedRef.current = key;
    const ro = new ResizeObserver(() => {
      if (fittedRef.current !== null) {
        // solo el primer encaje; después el usuario manda
        fit();
        fittedRef.current = "user";
      }
    });
    ro.observe(container);
    fit();
    return () => ro.disconnect();
  }, [fit, width, height]);

  /* ── Zoom con rueda (alrededor del cursor) ── */
  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const currentZoom = useStudio.getState().zoom;
      const currentPan = useStudio.getState().pan;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = Math.min(64, Math.max(0.02, currentZoom * factor));
      // mantiene el punto bajo el cursor fijo: p' = c - (c - p) * (z'/z)
      setPan({
        x: cx - ((cx - currentPan.x) * nextZoom) / currentZoom,
        y: cy - ((cy - currentPan.y) * nextZoom) / currentZoom,
      });
      setZoom(nextZoom);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [setPan, setZoom]);

  /* ── Pan + selección por puntero ── */
  const dragRef = React.useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [grabbing, setGrabbing] = React.useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current;
    if (d === null) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      setGrabbing(true);
    }
    if (d.moved) setPan({ x: d.panX + dx, y: d.panY + dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current;
    dragRef.current = null;
    setGrabbing(false);
    if (d === null || d.moved) return;
    // hit-test nativo del DOM (§5.3, O(profundidad del nodo))
    const target = e.target as Element | null;
    const g = target?.closest?.("g[data-layer-id]") as SVGGElement | null;
    if (g !== null) {
      const id = g.getAttribute("data-layer-id");
      // Pulso de selección (mutación directa, ARB-1 "golpe barato #4").
      if (!reducedMotionRef.current) {
        g.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: PULSE_MS, easing: "ease-out" });
      }
      selectLayer(id);
      if (isolatedLayerId !== null && id !== isolatedLayerId) isolateLayer(null);
    } else {
      selectLayer(null);
    }
  };

  /* ── Vista raster de la fuente (antes de vectorizar) ── */
  const rasterCanvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    if (hasVectorization || source === null) return;
    const canvas = rasterCanvasRef.current;
    if (canvas === null) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    const img = ctx.createImageData(source.width, source.height);
    img.data.set(source.imageData.data);
    ctx.putImageData(img, 0, 0);
  }, [hasVectorization, source, layersVersion]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "vt-checker relative min-h-0 flex-1 touch-none overflow-hidden rounded-lg border border-border",
        grabbing ? "vt-canvas-grabbing" : "vt-canvas-grab",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="application"
      aria-label="Lienzo de vectorización: arrastra para desplazar, rueda para zoom, clic en una zona para seleccionar su capa"
    >
      {source === null && !hasVectorization ? (
        <div className="flex h-full items-center justify-center">
          <EmptyState icon={ImageIcon} title="Carga la imagen fuente en el panel izquierdo" hint="JPG, PNG o WebP; los límites están en el panel." />
        </div>
      ) : (
        <div
          className="absolute left-0 top-0 origin-top-left shadow-[0_2px_20px_rgba(27,27,27,0.18)]"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {hasVectorization ? (
            <svg
              ref={svgRef}
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: "block", background: "transparent" }}
            >
              {[...layers]
                .sort((a, b) => a.orden - b.orden)
                .map((layer) => (
                  <LayerGroup
                    key={layer.id}
                    id={layer.id}
                    inner={fragmentInner(layer.fragmentSvg)}
                    register={registerGroupRef}
                  />
                ))}
            </svg>
          ) : (
            <canvas ref={rasterCanvasRef} width={width} height={height} style={{ display: "block" }} aria-label="Vista previa de la imagen fuente" />
          )}
        </div>
      )}

      {/* Barra de herramientas del lienzo (entra con spring, glass) */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.tool}
        className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/95 px-2 py-1 shadow-md backdrop-blur"
      >
        <Button size="icon" className="vt-hit size-7" variant="ghost" aria-label="Alejar" onClick={() => setZoom(zoom / 1.25)}>
          <Minus className="h-4 w-4" aria-hidden />
        </Button>
        {/* Readout sin remontaje (ARB1-9): sin key ni animación por tick de rueda. */}
        <span className="w-14 text-center font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)} %</span>
        <Button size="icon" className="vt-hit size-7" variant="ghost" aria-label="Acercar" onClick={() => setZoom(zoom * 1.25)}>
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
        <Button size="icon" className="vt-hit size-7" variant="ghost" aria-label="Ajustar a la ventana" onClick={fit}>
          <Maximize2 className="h-4 w-4" aria-hidden />
        </Button>
        {isolatedLayerId !== null && (
          <Button size="icon" className="vt-hit size-7 text-accent" variant="ghost" aria-label="Salir del aislamiento" onClick={() => isolateLayer(null)}>
            <Crosshair className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </motion.div>
    </div>
  );
}
