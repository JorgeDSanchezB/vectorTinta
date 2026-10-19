# Diagramas (fuentes Mermaid)

Renderizado: GitHub renderiza los bloques Mermaid de los `.md` automáticamente; localmente, con mermaid-cli:

```bash
bunx @mermaid-js/mermaid-cli -i arquitectura.mmd -o arquitectura.svg
bunx @mermaid-js/mermaid-cli -i flujo-vectorizacion.mmd -o flujo-vectorizacion.svg
bunx @mermaid-js/mermaid-cli -i er.mmd -o er.svg
```

Contenido:
- `arquitectura.mmd` — vista de tres niveles (cliente / API / datos) con puertos y adaptadores.
- `flujo-vectorizacion.mmd` — flujo de usuario de punta a punta, incluida la extensión por registro.
- `er.mmd` — diagrama entidad-relación del modelo de datos (Fase 2).
