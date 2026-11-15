"use client";

/**
 * VectorTinta — Moléculas compartidas del estudio (plan §1.6: átomos→moléculas).
 *
 * PanelStates implementa los CINCO estados obligatorios por panel (§5.5):
 * carga (skeleton con shimmer), vacío (CTA con levitación), error (shake-in,
 * Reintentar), parcial (chip) y listo. Los toasts son resultado de acciones;
 * NUNCA enmascaran un panel vacío. Motion centralizado en src/lib/motion.ts.
 */
import * as React from "react";
import { AlertTriangle, CheckCircle2, FileQuestion, Loader2, WandSparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PanelStatus } from "@/lib/state/slices/project";
import { DUR, EASE, SPRING, floatLoop, popEnd, popStart } from "@/lib/motion";

/* ───────────────────────── ColorSwatch ───────────────────────── */

export function ColorSwatch({
  hex,
  size = 22,
  className,
  title,
}: {
  hex: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <motion.span
      role="img"
      aria-label={title ?? `Color ${hex}`}
      title={title ?? hex}
      whileHover={{ scale: 1.18 }}
      transition={SPRING.pop}
      className={cn("inline-block rounded-[5px] border border-black/30 shadow-[0_1px_3px_rgba(0,0,0,0.45)]", className)}
      style={{ width: size, height: size, backgroundColor: hex }}
    />
  );
}

/* ───────────────────────── StateChip ───────────────────────── */

const CLASE_CHIP: Record<string, { label: string; className: string }> = {
  validacion: { label: "Validación", className: "bg-amber-400/10 text-amber-200 border-amber-400/30" },
  "params-invalidos": { label: "Params", className: "bg-amber-400/10 text-amber-200 border-amber-400/30" },
  "no-autenticado": { label: "Sesión", className: "bg-foreground/[0.07] text-foreground/70 border-border" },
  "no-encontrado": { label: "404", className: "bg-foreground/[0.07] text-foreground/70 border-border" },
  temporal: { label: "Temporal", className: "bg-orange-400/10 text-orange-200 border-orange-400/30" },
  configuracion: { label: "Config", className: "bg-orange-400/10 text-orange-200 border-orange-400/30" },
  interno: { label: "Crítico", className: "bg-red-400/10 text-red-200 border-red-400/30" },
  red: { label: "Red", className: "bg-foreground/[0.07] text-foreground/70 border-border" },
  local: { label: "Local", className: "bg-secondary text-secondary-foreground border-border" },
  listado: { label: "Listado", className: "bg-foreground/[0.07] text-foreground/70 border-border" },
};

export function StateChip({ clase, className }: { clase: string; className?: string }) {
  const conf = CLASE_CHIP[clase] ?? { label: clase, className: "bg-foreground/[0.07] text-foreground/70 border-border" };
  return (
    <Badge variant="outline" className={cn("shrink-0", conf.className, className)}>
      {conf.label}
    </Badge>
  );
}

/* ───────────────────────── PanelStates ───────────────────────── */

export function PanelStates({
  status,
  error,
  onRetry,
  empty,
  emptyHint,
  skeletonRows = 3,
  children,
  ariaLabel,
}: {
  status: PanelStatus;
  error?: string | null;
  onRetry?: () => void;
  empty?: React.ReactNode;
  emptyHint?: string;
  skeletonRows?: number;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const reduced = useReducedMotion();
  if (status === "loading") {
    return (
      <motion.div
        className="space-y-2 p-4"
        aria-busy="true"
        aria-label={ariaLabel}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR.fast }}
      >
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="vt-shimmer h-10 w-full" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </motion.div>
    );
  }
  if (status === "error") {
    return (
      <motion.div
        role="alert"
        className="flex flex-col items-center gap-2 p-6 text-center"
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: 0 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, x: [0, -7, 6, -3, 0] }}
        transition={{ duration: DUR.slow, ease: EASE.inOut }}
      >
        <AlertTriangle className="size-8 text-destructive" aria-hidden />
        <p className="text-sm font-medium">{error ?? "Algo falló al cargar este panel."}</p>
        {onRetry !== undefined && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <Loader2 className="mr-1 size-3.5" aria-hidden /> Reintentar
          </Button>
        )}
      </motion.div>
    );
  }
  if (status === "empty") {
    return (
      <motion.div
        className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/90 p-6 text-center"
        initial={{ opacity: 0, y: reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE.signature }}
      >
        <motion.span
          className="inline-flex text-muted-foreground/70"
          animate={reduced ? undefined : { y: [0, -5, 0] }}
          transition={reduced ? undefined : floatLoop}
        >
          <FileQuestion className="size-7" aria-hidden />
        </motion.span>
        {empty}
        {emptyHint !== undefined && <p className="max-w-[42ch] text-xs leading-snug text-muted-foreground">{emptyHint}</p>}
      </motion.div>
    );
  }
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", status === "partial" && "pt-1")}>
      {status === "partial" && (
        <div className="mb-1 flex items-center justify-center">
          <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-200">
            <AlertTriangle className="mr-1 size-3" aria-hidden /> Datos parcialmente degradados
          </Badge>
        </div>
      )}
      {children}
    </div>
  );
}

/* ───────────────────────── ProgressLine ───────────────────────── */

export function ProgressLine({ percent, phase, className }: { percent: number; phase?: string; className?: string }) {
  if (percent <= 0) return null;
  if (percent >= 100) {
    // Cierre honesto del proceso (ARB1-13c): el 100 % se anuncia y queda.
    return (
      <motion.div initial={popStart} animate={popEnd} className={className}>
        <OkChip>completado</OkChip>
      </motion.div>
    );
  }
  return (
    <motion.div
      className={cn("space-y-1", className)}
      aria-live="polite"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.fast }}
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="capitalize">{phase !== undefined && phase !== "" ? phase : "procesando"}…</span>
        <span className="tabular-nums">{Math.round(percent)} %</span>
      </div>
      <Progress value={percent} className="h-1.5" />
    </motion.div>
  );
}

/* ───────────────────────── QuotaMeter ───────────────────────── */

export function QuotaMeter({ used, max, label }: { used: number; max: number; label?: string }) {
  const ratio = Math.min(1, Math.max(0, used / Math.max(1, max)));
  const pct = Math.round(ratio * 100);
  const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-400" : "bg-[var(--vt-copper)]";
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground" title={`${used} de ${max}`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        {/* scaleX (compositor-only, ARB1-5); el track mide 64px fijos. */}
        <motion.div
          className={cn("h-full w-full rounded-full", tone)}
          style={{ transformOrigin: "left" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: ratio }}
          transition={SPRING.bar}
        />
      </div>
      <span className="tabular-nums">{used}/{max}{label !== undefined ? ` · ${label}` : ""}</span>
    </div>
  );
}

/* ───────────────────── Estado vacío con CTA ───────────────────── */

export function EmptyState({
  icon: Icon = WandSparkles,
  title,
  hint,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <motion.span
        className="inline-flex text-muted-foreground/70"
        animate={reduced ? undefined : { y: [0, -6, 0] }}
        transition={reduced ? undefined : floatLoop}
      >
        <Icon className="size-7" aria-hidden />
      </motion.span>
      <p className="text-sm font-medium">{title}</p>
      {hint !== undefined && <p className="max-w-[40ch] text-xs leading-snug text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

/* ───────────────────── Chips de resultado ───────────────────── */

export function OkChip({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      initial={popStart}
      animate={popEnd}
      className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs font-medium text-emerald-300"
    >
      <CheckCircle2 className="size-3" aria-hidden /> {children}
    </motion.span>
  );
}
