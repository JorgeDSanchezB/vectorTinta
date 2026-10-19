/**
 * VectorTinta — MigrationRegistry (plan §2.4/§4.2 paso 7).
 *
 * Los JSON almacenados (params de vectorización, manifests de exportación,
 * metadata de auditoría) son versionados. Al LEER: si `schemaVersion` es
 * menor que la actual, se aplican los migradores registrados v→v+1
 * (encadenables) y se REVALIDA con el esquema vigente del registro.
 * Un JSON corrupto tras migrar → clase CONFIG (se aísla el proyecto y se
 * avisa); NUNCA se "arregla" silenciosamente (regla del listón).
 */
import { makeProblem } from "@/lib/domain/errors";

export type Migrator<T> = (oldValue: T) => T;

interface MigrationSlot<T> {
  from: number;
  to: number;
  migrate: Migrator<T>;
}

export class MigrationRegistry<T> {
  private readonly slots: MigrationSlot<T>[] = [];

  /** Registra un paso v→v+1. Debe existir un paso por cada versión antigua soportada. */
  register(from: number, migrate: Migrator<T>): this {
    const exists = this.slots.some((s) => s.from === from);
    if (exists) {
      throw new Error(`MigrationRegistry: ya existe un migrador desde la versión ${from}`);
    }
    this.slots.push({ from, to: from + 1, migrate });
    return this;
  }

  /**
   * Recorre la cadena v_actual → v_objetivo aplicando migradores.
   * Lanza Problem `configuracion` si la cadena está rota (falta un paso).
   */
  migrate(value: T, from: number, to: number): T {
    let current = value;
    let version = from;
    while (version < to) {
      const step = this.slots.find((s) => s.from === version);
      if (!step) {
        throw new ApiConfigError(
          `No hay migrador registrado de la versión ${version} a ${version + 1}`,
        );
      }
      current = step.migrate(current);
      version = step.to;
    }
    return current;
  }
}

/** Error de migración clasificado (clase CONFIG; ver failure-modes.md). */
export class ApiConfigError extends Error {
  readonly problem = makeProblem("configuracion", {
    title: "Configuración o dato almacenado inválido",
    detail: "El JSON almacenado no se pudo migrar al esquema vigente.",
  });

  constructor(message: string) {
    super(message);
    this.name = "ApiConfigError";
  }
}
