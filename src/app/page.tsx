import { SpecApp } from "@/components/spec/SpecApp";

/**
 * Única ruta visible del entorno (restricción documentada en ADR-000).
 * Iteración 1 = solo planificación: esta página ES el visor de la especificación
 * VectorTinta, no el producto. Documento canónico: docs/PLAN-MAESTRO.md.
 */
export default function Page() {
  return <SpecApp />;
}
