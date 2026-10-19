# ADR-008 — Registros con esquemas (Preset/Exporter/Operation/Selection) frente a switch central

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

La regla del carro del enunciado exige que añadir un preset ("cómic"), un exportador ("pdf") o una operación de imagen NO modifique el núcleo. Un `switch (presetId)` en el validador o en el pipeline hace exactamente lo contrario: cada variante nueva toca el archivo central (riesgo de regresión en lo ya existente).

## Decisión

Cuatro registros con un contrato común (`RegistryEntry`: `id`, `label`, `description`, `schemaVersion`, `schema` Zod `.strict()`, `metadata`):

| Registro | Entradas v1 | Qué habilita añadir sin tocar núcleo |
|---|---|---|
| `PresetRegistry` | baja, media, alta (+ cómic como ejemplo documentado) | presets con esquema propio (el validador central valida contra "el esquema del preset dado") |
| `ExporterRegistry` | zip-serigrafia, png-mockup (+ pdf-capas documentado) | formatos con `manifestSchema` propio |
| `OperationRegistry` | bg-removal (+ esqueletonizar documentado) | operaciones de imagen en workers |
| `SelectionStrategyRegistry` | by-zone (+ by-tolerance/by-watershed documentados) | modos de selección intercambiables en el lienzo |

Los registros se **construyen desde manifiestos de configuración** (`app.config.ts`), no desde código del núcleo. El formulario del inspector se **genera desde el esquema Zod** (metadatos label/min/max/step/unidad), de modo que la UI de una variante nueva "sale gratis".

**Justificación anti-sobreingeniería (obligatoria por el enunciado):** un registro es un `Map<string, RegistryEntry>` + ~40 líneas de API (`get`, `list`, `assertValid`). *Problema que resuelve:* cerrar el núcleo a modificación y abrirlo a extensión. *Coste:* una indirección conceptual y la disciplina de versionar esquemas. *Alternativa descartada:* switch/if-else central (rompe la regla del carro) y plugin system dinámico cargando módulos en runtime (innecesario y arriesgado: superficie de seguridad sin caso de uso).

## Consecuencias (coste)

- Descubrimiento estático menos inmediato (hay que mirar el manifiesto para saber qué existe) — mitigado con `list()` que alimenta la UI.
- Cada entrada es obligatoriamente auto-contenida (esquema + metadatos), lo que fuerza buenas fronteras.

## Alternativas descartadas (además de las anteriores)

- **Herencia abstracta con fábrica:** jerarquías de clases rígidas para variantes que solo difieren en datos; el registro + esquema es más simple.
- **Plugins en runtime:** superficie de seguridad sin caso de uso real.
