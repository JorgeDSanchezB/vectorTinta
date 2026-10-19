import { StudioShell } from "@/components/studio/StudioShell";

/**
 * VectorTinta — Ruta única visible del entorno (restricción del sandbox).
 *
 * Iteración 2 (Fase 6): la ruta "/" ES el producto — el estudio de
 * vectorización y preparación de tintas. La especificación de la Iteración 1
 * sigue accesible como overlay desde el pie ("Especificación"), sin añadir
 * rutas nuevas.
 */
export default function Page() {
  return <StudioShell />;
}
