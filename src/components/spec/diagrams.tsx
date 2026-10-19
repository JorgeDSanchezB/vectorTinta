'use client';

/**
 * Diagramas ligeros del visor (CSS/Tailwind, sin dependencias externas):
 * arquitectura de 3 niveles, espacio de trabajo de 3 paneles, flujo numerado
 * y tarjetas de entidades del modelo. Fuentes Mermaid canónicas en docs/diagrams/.
 */

import * as React from "react";
import { ArrowDown, ChevronRight, Cpu, Database, Globe, Layers } from "lucide-react";
import { Chip } from "./primitives";
import { entities } from "@/content/spec-data";

function Box({
  title,
  icon,
  children,
  tone = "api",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "client" | "api" | "data";
}) {
  const tones: Record<string, string> = {
    client: "border-[#c2410c]/35 bg-[#fdf1e7]",
    api: "border-stone-300 bg-white",
    data: "border-[#4a6741]/35 bg-[#f2f4ee]",
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-800">
        {icon}
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function ArchitectureDiagram() {
  return (
    <div className="space-y-3" role="img" aria-label="Diagrama de arquitectura: cliente con workers, API con validación y datos con adaptadores">
      <Box title="Cliente (navegador)" icon={<Globe className="size-4 text-[#c2410c]" aria-hidden />} tone="client">
        <Chip>Next.js 16 · React 19 · TS</Chip>
        <Chip>Tailwind 4 · shadcn/ui (Radix)</Chip>
        <Chip>Zustand slices</Chip>
        <Chip>react-window</Chip>
        <Chip>SVG nativo interactivo</Chip>
        <Chip tone="accent">vectorizer.worker (WASM)</Chip>
        <Chip tone="accent">bg-removal.worker (ONNX)</Chip>
        <Chip tone="accent">export.worker (ZIP)</Chip>
      </Box>
      <div className="flex justify-center" aria-hidden>
        <ArrowDown className="size-4 text-stone-400" />
      </div>
      <Box title="API — Route Handlers /api/**" icon={<Cpu className="size-4 text-stone-600" aria-hidden />} tone="api">
        <Chip>Zod strict · RFC 7807</Chip>
        <Chip>jose JWT + argon2</Chip>
        <Chip>Cursor (createdAt, id)</Chip>
        <Chip>Rate limiting configurable</Chip>
        <Chip>Cuotas por configuración</Chip>
        <Chip>Registros: Preset · Exporter · Operation</Chip>
        <Chip>AuditEvent (trazabilidad)</Chip>
      </Box>
      <div className="flex justify-center" aria-hidden>
        <ArrowDown className="size-4 text-stone-400" />
      </div>
      <Box title="Datos (adaptadores sustituibles)" icon={<Database className="size-4 text-[#4a6741]" aria-hidden />} tone="data">
        <Chip>Prisma ORM</Chip>
        <Chip tone="verified">SQLite (sandbox)</Chip>
        <Chip tone="verified">PostgreSQL 16 (prod)</Chip>
        <Chip>StorageAdapter: Local FS → S3/MinIO/R2</Chip>
      </Box>
    </div>
  );
}

export function WorkspaceDiagram() {
  const panels = [
    {
      title: "Izquierda · Asset + Layers",
      items: ["Carga con validación", "Árbol de capas", "react-window > 50 nodos", "Clave estable layer.id"],
    },
    {
      title: "Centro · VectorStage",
      items: ["SVG nativo · viewBox", "Selección por hit-test DOM", "Recolor instantáneo", "Vistas: editar | tintas"],
    },
    {
      title: "Derecha · Inspector",
      items: ["Formulario autogenerado del preset", "Paleta de tintas (config)", "Exportación (registry)", "Cuota y diagnósticos"],
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="img" aria-label="Espacio de trabajo de tres paneles">
      {panels.map((p) => (
        <div key={p.title} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-stone-800 uppercase">
            <Layers className="size-3.5 text-[#c2410c]" aria-hidden />
            {p.title}
          </div>
          <ul className="space-y-1.5">
            {p.items.map((it) => (
              <li key={it} className="flex gap-2 text-xs text-stone-600">
                <ChevronRight className="mt-0.5 size-3 shrink-0 text-stone-400" aria-hidden />
                {it}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function FlowSteps({ steps, ariaLabel }: { steps: string[]; ariaLabel: string }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-2" aria-label={ariaLabel}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <li className="flex items-center rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs leading-snug text-stone-700 shadow-sm">
            <span className="mr-1.5 font-mono text-[10px] font-bold text-[#c2410c]">{String(i + 1).padStart(2, "0")}</span>
            {s}
          </li>
          {i < steps.length - 1 ? (
            <li aria-hidden className="hidden items-center text-stone-400 sm:flex">
              <ChevronRight className="size-4" />
            </li>
          ) : null}
        </React.Fragment>
      ))}
    </ol>
  );
}

export function EntityCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Entidades del modelo de datos">
      {entities.map((e) => (
        <div
          key={e.nombre}
          role="listitem"
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <p className="mb-1.5 font-mono text-xs font-bold tracking-tight text-[#c2410c]">{e.nombre}</p>
          <p className="mb-2 text-[11px] leading-relaxed text-stone-600">{e.campos}</p>
          <p className="border-t border-stone-100 pt-2 text-[11px] leading-relaxed text-stone-500">{e.invariantes}</p>
        </div>
      ))}
    </div>
  );
}
