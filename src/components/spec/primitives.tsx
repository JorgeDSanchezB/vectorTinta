'use client';

/**
 * Primitivos del visor de la especificación VectorTinta.
 * Átomos/moléculas de UI reutilizadas por todas las secciones.
 */

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Chip / insignia ───────────────────────────────────────────── */

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "verified" | "pending" | "ink";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-stone-200 bg-white text-stone-600",
    accent: "border-[#c2410c]/30 bg-[#c2410c]/10 text-[#9a3412]",
    verified: "border-[#4a6741]/40 bg-[#4a6741]/10 text-[#3a5333]",
    pending: "border-amber-300 bg-amber-50 text-amber-900",
    ink: "border-stone-800 bg-stone-900 text-stone-50",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Encabezado de sección ──────────────────────────────────────── */

export function SectionShell({
  id,
  number,
  title,
  intro,
  children,
  className,
}: {
  id: string;
  number: string;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn("scroll-mt-28 rounded-2xl border border-stone-200/80 bg-white/70 p-5 shadow-sm sm:p-8", className)}
    >
      <div className="mb-6 flex items-start gap-4">
        <span aria-hidden className="select-none font-serif text-4xl leading-none font-semibold text-[#c2410c] sm:text-5xl">
          {number}
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="font-serif text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
            {title}
          </h2>
          {intro ? <div className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-600">{intro}</div> : null}
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

/* ── Subtítulo interno ─────────────────────────────────────────── */

export function SubHead({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-serif text-base font-semibold tracking-tight text-stone-800">{children}</h3>
      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

/* ── Tabla genérica responsive ─────────────────────────────────── */

export type Column<T> = {
  head: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  caption,
  maxHeight = "max-h-[520px]",
}: {
  columns: Column<T>[];
  rows: T[];
  caption?: string;
  maxHeight?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className={cn("overflow-auto", maxHeight)} data-testid="data-table-scroll">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="sticky top-0 z-10 bg-[#f5f1ea]">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.head}
                  scope="col"
                  className={cn("border-b border-stone-200 px-3 py-2.5 font-semibold tracking-tight text-stone-700", c.className)}
                >
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="odd:bg-white even:bg-[#faf7f2]/60">
                {columns.map((c) => (
                  <td key={c.head} className="border-b border-stone-100 px-3 py-2 align-top text-stone-700">
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Bloque de código con copia ────────────────────────────────── */

export function CodeBlock({
  code,
  label,
  maxHeight = "max-h-[420px]",
}: {
  code: string;
  label?: string;
  maxHeight?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin fallback silencioso: el botón informa por estado visual.
      setCopied(false);
    }
  }, [code]);

  return (
    <figure className="overflow-hidden rounded-xl border border-stone-800/15 bg-stone-900 shadow-sm">
      <figcaption className="flex items-center justify-between gap-3 border-b border-stone-700/60 px-3 py-2">
        <span className="font-mono text-[11px] tracking-wide text-stone-400">{label ?? "código"}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-md border border-stone-600 px-2 py-1 text-[11px] font-medium text-stone-300 transition-colors hover:border-stone-400 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
          aria-label={`Copiar ${label ?? "bloque de código"}`}
        >
          {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </figcaption>
      <pre className={cn("overflow-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-stone-100", maxHeight)}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

/* ── Tarjeta informativa ───────────────────────────────────────── */

export function InfoCard({
  title,
  tone = "neutral",
  icon,
  children,
}: {
  title: string;
  tone?: "neutral" | "accent" | "warn";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "border-stone-200 bg-white",
    accent: "border-[#c2410c]/30 bg-[#fdf1e7]",
    warn: "border-amber-300 bg-amber-50",
  };
  return (
    <div className={cn("rounded-xl border p-4", tones[tone])}>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-stone-800">
        {icon}
        {title}
      </div>
      <div className="text-xs leading-relaxed text-stone-600">{children}</div>
    </div>
  );
}

/* ── Lista con viñetas de tinta ─────────────────────────────────── */

export function InkList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-stone-700">
          <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#c2410c]" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
