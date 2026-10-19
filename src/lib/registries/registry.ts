/**
 * VectorTinta — Registro genérico (ADR-008: registros vs switch).
 *
 * Contrato común de los tres registros (presets, exportadores, operaciones).
 * Añadir una variante = añadir una ENTRADA (datos), no un caso nuevo en el
 * núcleo. `id` inexistente NO lanza: el llamante responde 400 enumerable con
 * la lista soportada (plan §4.3).
 */
import { z } from "zod";

export interface RegistryEntry<TId extends string, TSchema extends z.ZodType> {
  id: TId;
  label: string;
  description: string;
  /** Versión del esquema de esta entrada: gobierna las migraciones al LEER. */
  schemaVersion: number;
  /** Esquema Zod `.strict()`; valida la variante en el borde HTTP y en el cliente. */
  schema: TSchema;
  /** Metadatos declarativos (licencia, alcance, notas de taller…). */
  metadata?: Record<string, string>;
}

export class Registry<TId extends string, TSchema extends z.ZodType> {
  private readonly map = new Map<string, RegistryEntry<TId, TSchema>>();

  constructor(entries: RegistryEntry<TId, TSchema>[]) {
    for (const entry of entries) {
      if (this.map.has(entry.id)) {
        throw new Error(`Registro: id duplicado "${entry.id}"`);
      }
      this.map.set(entry.id, entry);
    }
  }

  get(id: string): RegistryEntry<TId, TSchema> | undefined {
    return this.map.get(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  /** Lista completa (orden de inserción = orden del manifiesto de configuración). */
  list(): RegistryEntry<TId, TSchema>[] {
    return [...this.map.values()];
  }

  /** Ids soportados para los 400 enumerables (plan §4.3). */
  ids(): string[] {
    return [...this.map.keys()];
  }
}
