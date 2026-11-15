"use client";

/**
 * VectorTinta — Lienzo SVG nativo (ADR-002, plan §5.2/§5.3).
 *
 * Design v3 «Mesa de Tinta»: el lienzo es una mesa oscura con grano (vt-desk)
 * y un foco cálido que sigue al puntero (div compositor-only, apagado con
 * reduced motion). La obra vive en una HOJA DE PAPEL clara (vt-sheet) con
 * sombra real — el patrón de transparencia (vt-checker) queda dentro de la
 * hoja, como corresponde.
 *
 * Mecánica de rendimiento (presupuesto <100 ms declarado §5.3):
 *  - Los fragmentos de capa se inlinean UNA vez por cambio estructural
 *    (`layersVersion`); recolor/visibilidad/orden NO re-renderizan React:
 *    se aplican por mutación directa del DOM (refs a cada <g data-layer-id>).
 *  - Selección: hit-test nativo `closest('[data-layer-id]')` (O(profundidad)).
 *  - Zoom/pan: transform CSS del contenedor; no toca el árbol SVG.
 *  - Aislar: display del resto (O(n capas), n ≤ 30).
 *  - colorHex inválido en datos leídos → magenta de rescate de configuración
 *    (rendering.fallbackColorHex) que DENUNCIA el problema (§5.2).
 */
import * as React from "react";
import { Crosshair, Droplets, Image as ImageIcon, Maximize2, Minus, Plus, Upload, WandSparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/config/app.config";
import { isValidColorHex } from "@/lib/domain/invariants";
import { fragmentInner } from "@/lib/state/slices/project";
import { useStudio } from "@/lib/state/store";
import { cn } from "@/lib/utils";
import { SPRING, REVEAL, PULSE_MS, floatLoop } from "@/lib/motion";

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

/** Paso del onboarding del estado vacío. */
function OnboardStep({ n, icon: Icon, title, hint }: { n: string; icon: React.ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5 text-left">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/70 font-mono text-[10px] font-semibold text-[var(--vt-copper)]">
        {n}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/90">
          <Icon className="size-3 text-muted-foreground" aria-hidden /> {title}
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{hint}</span>
      </span>
    </div>
  );
}

export function VectorStage() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const groupRefs = React.useRef(new Map<string, SVGGElement>());
  const appliedRef = React.useRef<Map<string, LayerDomState>>(new Map());
  const spotRef = React.useRef<HTMLDivElement>(null);

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

  /* ── Pan + selección por puntero + foco de la mesa ──
     El foco (spotlight) se mueve por mutación directa de style.transform:
     cero re-render de React, compositor-only. */
  const dragRef = React.useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [grabbing, setGrabbing] = React.useState(false);

  const moveSpotlight = React.useCallback((clientX: number, clientY: number): void => {
    const el = spotRef.current;
    const container = containerRef.current;
    if (el === null || container === null) return;
    const rect = container.getBoundingClientRect();
    el.style.transform = `translate3d(${clientX - rect.left - 450}px, ${clientY - rect.top - 450}px, 0)`;
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!reducedMotionRef.current) moveSpotlight(e.clientX, e.clientY);
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

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
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
        "vt-desk relative min-h-0 flex-1 touch-none overflow-hidden rounded-xl border border-border/70",
        grabbing ? "vt-canvas-grabbing" : "vt-canvas-grab",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="application"
      aria-label="Lienzo de vectorización: arrastra para desplazar, rueda para zoom, clic en una zona para seleccionar su capa"
    >
      {/* Foco cálido de la mesa (compositor-only; invisible con reduced motion) */}
      {!reduced && (
        <div
          ref={spotRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 size-[900px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(224,100,124,0.06) 0%, rgba(233,184,36,0.03) 38%, transparent 62%)" }}
        />
      )}
      {/* Viñeta de la mesa: profundidad sin gradiente en el contenido */}
      <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_90px_rgba(0,0,0,0.45)]" />

      {source === null && !hasVectorization ? (
        <div className="relative flex h-full items-center justify-center p-6">
          <div className="flex max-w-xs flex-col items-center gap-5 text-center">
            <motion.span
              className="flex size-16 items-center justify-center rounded-full border border-dashed border-foreground/20 text-muted-foreground"
              animate={reduced ? undefined : { y: [0, -6, 0] }}
              transition={reduced ? undefined : floatLoop}
            >
              <ImageIcon className="size-6" aria-hidden />
            </motion.span>
            <div className="space-y-3">
              <p className="text-sm font-medium">Tu mesa está lista</p>
              <OnboardStep n="1" icon={Upload} title="Sube tu arte" hint="En el panel «Imagen fuente», arriba a la izquierda." />
              <OnboardStep n="2" icon={WandSparkles} title="Vectoriza" hint="Elige un preset en el Inspector y separa las tintas." />
              <OnboardStep n="3" icon={Droplets} title="Prepara el fotolito" hint="Recolorea, ordena y exporta el ZIP de serigrafía." />
            </div>
          </div>
        </div>
      ) : (
        <div
          className="vt-sheet absolute left-0 top-0 origin-top-left rounded-[2px]"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {/* Patrón de transparencia DENTRO de la hoja */}
          <div aria-hidden className="vt-checker absolute inset-0" />
          {hasVectorization ? (
            <svg
              ref={svgRef}
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: "block", background: "transparent", position: "relative" }}
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
            <canvas ref={rasterCanvasRef} width={width} height={height} style={{ display: "block", position: "relative" }} aria-label="Vista previa de la imagen fuente" />
          )}
        </div>
      )}

      {/* Barra de herramientas del lienzo (entra con spring, glass oscuro) */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.tool}
        className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-card/90 px-1.5 py-1 shadow-lg backdrop-blur"
      >
        <Button size="icon" className="vt-hit size-7 rounded-full" variant="ghost" aria-label="Alejar" onClick={() => setZoom(zoom / 1.25)}>
          <Minus className="size-4" aria-hidden />
        </Button>
        {/* Readout sin remontaje (ARB1-9): sin key ni animación por tick de ruedas. */}
        <span className="w-14 text-center font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)} %</span>
        <Button size="icon" className="vt-hit size-7 rounded-full" variant="ghost" aria-label="Acercar" onClick={() => setZoom(zoom * 1.25)}>
          <Plus className="size-4" aria-hidden />
        </Button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <Button size="icon" className="vt-hit size-7 rounded-full" variant="ghost" aria-label="Ajustar a la ventana" onClick={fit}>
          <Maximize2 className="size-4" aria-hidden />
        </Button>
        {isolatedLayerId !== null && (
          <Button size="icon" className="vt-hit size-7 rounded-full text-[var(--vt-copper)]" variant="ghost" aria-label="Salir del aislamiento" onClick={() => isolateLayer(null)}>
            <Crosshair className="size-4" aria-hidden />
          </Button>
        )}
      </motion.div>
    </div>
  );
}
