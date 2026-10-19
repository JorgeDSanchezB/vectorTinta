'use client';

/**
 * Panel “en vivo” de la configuración: importa el artefacto REAL de Fase 6
 * (src/lib/config/app.config.ts) y renderiza sus valores validados con Zod.
 * Ninguna cifra de esta sección está escrita a mano en el visor.
 */

import * as React from "react";
import { FileArchive, FlaskConical, Hash, Palette, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chip, SubHead } from "./primitives";
import { appConfig, configDigest } from "@/lib/config/app.config";

function fmtBytes(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(0)} MiB` : `${(bytes / 1024).toFixed(0)} KiB`;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-stone-100 py-1.5 last:border-0">
      <dt className="min-w-0 break-all font-mono text-[11px] text-stone-500">{k}</dt>
      <dd className="min-w-0 max-w-full text-right text-xs font-medium break-words text-stone-800">{v}</dd>
    </div>
  );
}

export function LiveConfig() {
  const c = appConfig;

  const sampleFileName = c.export.filePattern
    .replace("{orden:02d}", "01")
    .replace("{colorHex}", "#1B1B1B")
    .replace("{layerId}", "l9f3k2");
  const sampleInkMark = c.export.inkMarkPattern.replace("{orden:02d}", "01").replace("{colorHex}", "#1B1B1B");

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <SubHead hint={`digest ${configDigest} · configSchemaVersion ${c.configSchemaVersion}`}>
        Prueba viva de la regla de cero-hardcoding
      </SubHead>
      <p className="mt-1 mb-4 text-xs leading-relaxed text-stone-600">
        Este panel importa <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[10.5px]">src/lib/config/app.config.ts</code> y
        pinta sus valores reales tras la validación Zod de arranque. Cambiar un límite = editar configuración, no código.
      </p>

      <Tabs defaultValue="limites">
        <TabsList className="mb-3 h-auto flex-wrap gap-1 bg-[#f5f1ea] p-1">
          <TabsTrigger value="limites" className="gap-1.5 text-xs">
            <ShieldCheck className="size-3.5" aria-hidden /> Límites y cuotas
          </TabsTrigger>
          <TabsTrigger value="presets" className="gap-1.5 text-xs">
            <FlaskConical className="size-3.5" aria-hidden /> Presets de vectorización
          </TabsTrigger>
          <TabsTrigger value="paleta" className="gap-1.5 text-xs">
            <Palette className="size-3.5" aria-hidden /> Paleta serigráfica
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5 text-xs">
            <FileArchive className="size-3.5" aria-hidden /> Exportación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="limites" className="mt-0">
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <dl>
              <Row k="image.maxUploadBytes" v={`${fmtBytes(c.limits.image.maxUploadBytes)}`} />
              <Row k="image.maxDimension" v={`${c.limits.image.maxDimension} px`} />
              <Row k="image.maxPixels" v={c.limits.image.maxPixels.toLocaleString("es-ES")} />
              <Row k="image.allowedMimeTypes" v={c.limits.image.allowedMimeTypes.join(" · ")} />
              <Row k="layers.maxPerVectorization" v={c.limits.layers.maxPerVectorization} />
              <Row k="layers.historyStackSize" v={`${c.limits.layers.historyStackSize} comandos`} />
            </dl>
            <dl>
              <Row k="projects.maxPerUserFree" v={c.limits.projects.maxPerUserFree} />
              <Row k="projects.maxAssetsPerProject" v={c.limits.projects.maxAssetsPerProject} />
              <Row k="exports.maxPerDay" v={c.limits.exports.maxPerDay} />
              <Row k="json.maxBytes / maxDepth" v={`${fmtBytes(c.limits.json.maxBytes)} / ${c.limits.json.maxDepth}`} />
              <Row k="pagination.default / max" v={`${c.pagination.defaultLimit} / ${c.pagination.maxLimit}`} />
              <Row k="rendering.virtualizationThreshold" v={`${c.rendering.virtualizationThreshold} nodos`} />
              <Row
                k="rendering.fallbackColorHex"
                v={
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="inline-block size-3 rounded-full border border-stone-300" style={{ background: c.rendering.fallbackColorHex }} />
                    {c.rendering.fallbackColorHex}
                  </span>
                }
              />
              <Row k="mobile.blockHeavyOpsBelowViewportPx" v={`${c.mobile.blockHeavyOpsBelowViewportPx} px`} />
              <Row k="bgRemoval.modelUrlEnvName" v={<code className="break-all font-mono text-[10.5px]">{c.bgRemoval.modelUrlEnvName}</code>} />
              <Row k="bgRemoval.consentNoticeMinBytes" v={fmtBytes(c.bgRemoval.consentNoticeMinBytes)} />
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="presets" className="mt-0">
          <div className="grid gap-3 sm:grid-cols-3">
            {c.vectorization.presetManifest.map((p) => (
              <div key={p.id} className="rounded-lg border border-stone-200 bg-[#faf7f2] p-3.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="font-serif text-sm font-semibold text-stone-900">{p.label}</p>
                  <Chip tone="accent">{p.id}</Chip>
                </div>
                <p className="mb-2.5 text-[11px] leading-relaxed text-stone-600">{p.description}</p>
                <dl className="space-y-1">
                  <Row k="colorPrecision" v={p.params.colorPrecision} />
                  <Row k="filterSpeckle" v={p.params.filterSpeckle} />
                  <Row k="cornerThreshold" v={p.params.cornerThreshold} />
                  <Row k="lengthThreshold" v={p.params.lengthThreshold} />
                  <Row k="mode" v={p.params.mode} />
                  <Row k="maxColors" v={p.params.maxColors} />
                </dl>
                <p className="mt-2 text-[10px] text-stone-400">schemaVersion {p.schemaVersion}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
            Añadir el preset <strong>“cómic”</strong> = 1 entrada en este manifiesto + su archivo de esquema en Fase 6. El validador
            central y la UI no se tocan (ADR-008): el formulario se genera desde el esquema.
          </p>
        </TabsContent>

        <TabsContent value="paleta" className="mt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {c.colors.inkPalette.map((ink) => (
              <div key={ink.hex + ink.name} className="flex items-center gap-2.5 rounded-lg border border-stone-200 bg-[#faf7f2] p-2.5">
                <span
                  aria-hidden
                  className="size-8 shrink-0 rounded-md border border-stone-300 shadow-inner"
                  style={{ background: ink.hex }}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-stone-800">{ink.name}</p>
                  <p className="font-mono text-[10.5px] text-stone-500">{ink.hex}</p>
                  {ink.note ? <p className="truncate text-[10px] text-stone-400">{ink.note}</p> : null}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-stone-500">
            {c.colors.inkPalette.length} tintas con nombre: dato de dominio en configuración (la vista “Preparación de tintas” parte de aquí).
          </p>
        </TabsContent>

        <TabsContent value="export" className="mt-0">
          <dl className="mb-4">
            <Row k="formatos registrados" v={c.export.formats.map((f) => f.id).join(" · ")} />
            <Row k="export.filePattern" v={<code className="break-all font-mono text-[10.5px]">{c.export.filePattern}</code>} />
            <Row k="export.inkMarkPattern" v={<code className="break-all font-mono text-[10.5px]">{c.export.inkMarkPattern}</code>} />
            <Row k="manifestFileName" v={c.export.manifestFileName} />
            <Row k="printOrderStrategy" v={c.export.printOrderStrategy} />
          </dl>
          <div className="grid gap-2 rounded-lg border border-dashed border-stone-300 bg-[#faf7f2] p-3.5 sm:grid-cols-2">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">
                <Hash className="size-3" aria-hidden /> Ejemplo de nombre de capa
              </p>
              <code className="font-mono text-xs text-stone-800">{sampleFileName}</code>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Ejemplo de marca de tinta</p>
              <code className="font-mono text-xs text-stone-800">{sampleInkMark}</code>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
            Nombres estables exigidos por el listón: derivados de plantilla + ids, nunca de contadores globales ni índices.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
