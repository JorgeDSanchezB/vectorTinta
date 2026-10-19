"use client";

/**
 * VectorTinta — Moléculas compartidas del estudio (plan §1.6: átomos→moléculas).
 *
 * PanelStates implementa los CINCO estados obligatorios por panel (§5.5):
 * carga (skeleton), vacío (CTA), error (Reintentar), parcial (chip) y listo.
 * Los toasts son resultado de acciones; NUNCA enmascaran un panel vacío.
 */
import * as React from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileQuestion, Loader2, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PanelStatus } from "@/lib/state/slices/project";

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
    <span
      role="img"
      aria-label={title ?? `Color ${hex}`}
      title={title ?? hex}
      className={cn("inline-block rounded-[4px] border border-black/25 shadow-sm", className)}
      style={{ width: size, height: size, backgroundColor: hex }}
    />
  );
}

/* ───────────────────────── StateChip ───────────────────────── */

const CLASE_CHIP: Record<string, { label: string; className: string }> = {
  validacion: { label: "Validación", className: "bg-amber-100 text-amber-900 border-amber-300" },
  "params-invalidos": { label: "Params", className: "bg-amber-100 text-amber-900 border-amber-300" },
  "no-autenticado": { label: "Sesión", className: "bg-stone-200 text-stone-800 border-stone-400" },
  "no-encontrado": { label: "404", className: "bg-stone-200 text-stone-800 border-stone-400" },
  temporal: { label: "Temporal", className: "bg-orange-100 text-orange-900 border-orange-300" },
  configuracion: { label: "Config", className: "bg-orange-100 text-orange-900 border-orange-300" },
  interno: { label: "Crítico", className: "bg-red-100 text-red-900 border-red-300" },
  red: { label: "Red", className: "bg-stone-200 text-stone-800 border-stone-400" },
  local: { label: "Local", className: "bg-sky-100 text-sky-900 border-sky-300" },
  listado: { label: "Listado", className: "bg-stone-200 text-stone-800 border-stone-400" },
};

export function StateChip({ clase, className }: { clase: string; className?: string }) {
  const conf = CLASE_CHIP[clase] ?? { label: clase, className: "bg-stone-200 text-stone-800 border-stone-400" };
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
  if (status === "loading") {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label={ariaLabel}>
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (status === "error") {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
        <p className="text-sm font-medium">{error ?? "Algo falló al cargar este panel."}</p>
        {onRetry !== undefined && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <Loader2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Reintentar
          </Button>
        )}
      </div>
    );
  }
  if (status === "empty") {
    return (
      <div className="vt-halftone flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/80 p-6 text-center">
        <FileQuestion className="h-8 w-8 text-muted-foreground" aria-hidden />
        {empty}
        {emptyHint !== undefined && <p className="max-w-[42ch] text-xs text-muted-foreground">{emptyHint}</p>}
      </div>
    );
  }
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", status === "partial" && "pt-1")}>
      {status === "partial" && (
        <div className="mb-1 flex items-center justify-center">
          <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden /> Datos parcialmente degradados
          </Badge>
        </div>
      )}
      {children}
    </div>
  );
}

/* ───────────────────────── ProgressLine ───────────────────────── */

export function ProgressLine({ percent, phase, className }: { percent: number; phase?: string; className?: string }) {
  if (percent <= 0 || percent >= 100) return null;
  return (
    <div className={cn("space-y-1", className)} aria-live="polite">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="capitalize">{phase !== undefined && phase !== "" ? phase : "procesando"}…</span>
        <span className="tabular-nums">{Math.round(percent)} %</span>
      </div>
      <Progress value={percent} className="h-1.5" />
    </div>
  );
}

/* ───────────────────────── QuotaMeter ───────────────────────── */

export function QuotaMeter({ used, max, label }: { used: number; max: number; label?: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground" title={`${used} de ${max}`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
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
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Icon className="h-7 w-7 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {hint !== undefined && <p className="max-w-[40ch] text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

/* ───────────────────── Chips de resultado ───────────────────── */

export function OkChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-900">
      <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> {children}
    </Badge>
  );
}

export function PendingChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="border-stone-300 bg-stone-100 text-stone-700">
      <Clock3 className="mr-1 h-3 w-3" aria-hidden /> {children}
    </Badge>
  );
}
