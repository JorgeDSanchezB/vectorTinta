# Informe del Árbitro — VectorTinta, Iteración 1 (solo planificación)

**Árbitro:** subagente adversarial independiente (Task ARB-1) + autoauditoría del orquestador (Ronda 0) + cierre re-verificado (Ronda 2).
**Ámbito:** docs/, artefacto `src/lib/config/app.config.ts`, visor de la especificación en `/`, worklog.
**Regla de honestidad aplicada:** en esta iteración NO existe implementación del producto (por acuerdo del enunciado: “solo se planifica; la Fase 6 debe quedar preparada pero no inventada”). Ningún punto del listón se da por verificado en runtime del producto; solo se verifica el diseño (estático) con comandos reproducibles, y lo no verificable queda marcado con su protocolo de reproducción.

---

## Ronda 0 — Autoauditoría del orquestador (veredicto: aceptada con correcciones)

Hallazgos corregidos antes de convocar al árbitro:

1. **Digest no portable (severidad media):** la primera versión de `app.config.ts` usaba `Bun.SHA256`, API inexistente en el navegador (el archivo se importa en el cliente). Corregido a FNV-1a en TypeScript puro (dependencia cero).
2. **Falsos positivos del grep TODO/FIXME (info):** las coincidencias son la palabra castellana “TODOS”; no hay marcadores pendientes. Verificable: `rg -n 'TODO|FIXME|PLACEHOLDER' docs src/lib/config`.

Verificado en Ronda 0 (comandos reales): parseo Zod de `app.config.ts` en runtime (`bun -e "await import(...)"`), existencia y tamaño no nulo de los 3 fixtures y 14 archivos de docs, tipificación correcta del listón.

## Ronda 1 — Árbitro adversarial independiente, Task ARB-1 (veredicto: PASA CON CORRECCIONES MENORES)

El árbitro (que no participó en la construcción) reprodujo TODAS las verificaciones afirmadas — digest idéntico, fixtures con bytes, `tsc` 0, lint 0, HTTP 200 del visor, 375 px sin scroll horizontal, `aria`/`lang=es` — y auditó punto por punto el listón. Emitió 10 rechazos accionables (R-1..R-10); ninguno obligaba a rehacer fases de fondo.

### Rechazos y correcciones exigidas

| # | Severidad | Rechazo | Corrección aplicada |
|---|---|---|---|
| R-1 | Media | Cursor de ejemplo mal codificado (`…MFofcC0x` decodificaba sin el `\|` declarado) | §3.3 corregido a `MjAyNS0wNS0zMFQwOTowMDowMFp8cC0x`; verificado con `printf '2025-05-30T09:00:00Z\|p-1' \| base64` |
| R-2 | Media | Fixtures “PNG” que eran JPEG reales (JFIF) | Convertidos a PNG real (8-bit RGB 1024×1024) con `sharp`; `file` lo confirma; nota de procedencia en fixtures/README.md; copias del visor actualizadas |
| R-3 | Media | Faltaban cuerpos RFC 7807 de 401, 404-ajeno, 413, 429, 503 | Añadidos al plan §3.3 y al visor (CodeBlock de ejemplos por clase) |
| R-4 | Media | worklog.md sin registrar la ejecución real | Entrada de ejecución real añadida (comandos y resultados) antes del cierre |
| R-5 | Media-baja | Referencias muertas: `docs/INFORME-ARBITRO.md` inexistente y “docker-compose.yml del repo” | Este archivo se crea con la acta real; §6.3 reformulado: compose a crear en producción, no incluido en esta iteración |
| R-6 | Baja | Relleno de `{orden}` sin declarar en la plantilla | Token `{orden:02d}` documentado en `app.config.ts` (comentario y plantilla) y en el plan §9 |
| R-7 | Baja | “5 listados” contando el drawer (son 4 endpoints paginados) | Conteo corregido a 4 endpoints (projects, assets, layers, exports) + drawer como consumidor, en plan, visor y listón |
| R-8 | Baja | “localStorage cifrado” sin mecanismo | failure-modes §5 reescrito: serialización JSON sin PII; cifrado AES-GCM/WebCrypto declarado como endurecimiento de producción PENDIENTE, no como propiedad existente |
| R-9 | Baja | §9 sin `passwordMinLength` ni parámetros argon2 en server.config.ts | §9 ampliado: TTL de tokens, rate limits, `auth.passwordMinLength` y argon2 (m=19456, t=2, p=1) |
| R-10 | Baja | Faltaba el ejemplo 200 de `GET /api/projects/:id` (contrato central del punto de persistencia) | Añadido al plan §3.3 y al visor |

Observaciones no bloqueantes del árbitro, también aplicadas: `errors` del 409 de cuota sin campo ajeno (`{resource:"projects",…}` en lugar de `{field:"name",…}`), ternario siempre-verdadero en el pie del visor (ahora importa y muestra el digest real `configDigest`), etiquetado “ejemplos” en los CodeBlocks del visor.

### Veredicto del árbitro sobre el listón (Ronda 1)

- **Puntos 1–7** (vectorización fiel, bg-removal cliente reversible, recoloreo, capas con nombres estables, exportación serigráfica, <100 ms, persistencia tras recarga): **⏳ no-verificables-hasta-implementación, correctamente tipificados**; diseño completo + protocolos reproducibles en `docs/fixtures/README.md`. El árbitro confirmó que ninguna frase afirma ejecuciones inexistentes.
- **Puntos 8–13** (extensibilidad, tolerancia a fallos, cero placeholders, cero hardcoding, escalabilidad, anti-sobreingeniería): **✅ verificados estáticamente** con evidencia reproducible (registros con manifiestos reales, failure-modes con 7 clases, grep limpio, `app.config.ts` validado, 4/4 listados con cursor, 11/11 ADRs con problema/coste/alternativa).
- **Transversales:** coherencia ADRs↔plan ✅; justificación de cambio de stack con plan de migración ✅; licencias marcadas `pending-audit` sin afirmaciones de verificación ✅; honestidad epistémica confirmada por reproducción ✅; contratos con Zod/JWT/RFC7807/413-antes-de-leer/404-a-ajenos ✅ (tras R-3); visor renderizando y responsive ✅; worklog ✅ (tras R-4).

## Ronda 2 — Re-verificación del orquestador tras aplicar R-1..R-10 (pre-cierre)

El orquestador aplicó las diez correcciones y las re-verificó con comandos reproducibles:

```
printf '2025-05-30T09:00:00Z|p-1' | base64   → MjAyNS0wNS0zMFQwOTowMDowMFp8cC0x  (R-1) ✓
file docs/fixtures/*.png                    → PNG image data, 1024x1024, 8-bit RGB (R-2) ✓
rg 'MjAyNS0wNS0zMFQwOTowMDowMFofcC0x' docs  → 0 coincidencias en material de contrato vigente (únicas excepciones: las citas históricas dentro de las actas) (R-1) ✓
rg 'docker-compose.yml del repo' docs      → 0 coincidencias en material de contrato vigente (idem) (R-5) ✓
bun -e "(await import('./src/lib/config/app.config.ts')).appConfig.export.filePattern"
                                            → capa-{orden:02d}-{colorHex}-{layerId}.svg (R-6) ✓
                                            → digest vigente fnv1a-1ae24ec7 (recalculado) ✓
bun run lint                                → 0 errores, 0 avisos ✓
bunx tsc --noEmit                           → 0 errores ✓
curl -w '%{http_code}' http://localhost:3000/ → 200 ✓
agente navegador @375px                     → scrollWidth 375 (sin scroll horizontal) ✓
```

## Ronda 3 — Verificación independiente del árbitro (Task ARB-2) y veredicto final: **ACEPTADA**

El mismo árbitro adversarial (que no participó en la construcción) re-ejecutó UNO A UNO sus diez rechazos con comandos propios, sin rubber-stamp, y además audité la propia acta. Resultado:

- **R-1..R-10: OK** salvo **R-6 PARCIAL** → hallazgo residual **R-6b**: el ejemplo del manifest seguía mostrando `capa-01-…`/`TINTA-01-…` con `"order": 0`, contradiciendo el token `{orden:02d}`. **R-6b aplicado**: el ejemplo ahora muestra `capa-00-#F2EFE6-l1.svg` y `TINTA-00-#F2EFE6` (coherente con `order: 0` + `:02d`), en plan y visor.
- **N-2 (BAJA)**: las frases literales “0 coincidencias (rg)” del pre-cierre eran inexactas porque las actas citan los valores antiguos como historia. Reformuladas a “0 coincidencias en material de contrato vigente”.
- **N-3 (MEDIA)**: el acta del orquestador pre-escribía el resultado de esta verificación antes de que el árbitro la ejecutara. Corregido: esta sección describe ahora la secuencia real (pre-cierre del orquestador → verificación independiente ARB-2) y cita el veredicto real emitido por ARB-2.
- Regresión comprobada por el árbitro: lint 0/0 · tsc 0 · HTTP 200 · visor con Rondas 0–2 visibles y digest vigente en el DOM · 375×667 sin scroll horizontal · fixtures PNG cargadas.

**VEREDICTO FINAL (ARB-2): ACEPTADA como planificación, con acta de salvedades N-1..N-3 — las tres mecánicas, verificables por grep y resueltas en esta misma entrega.** Ningún punto del listón se da por verificado en runtime del producto (no procede sin Fase 6, por acuerdo del enunciado); los puntos 8–13 y los transversales quedan verificados estáticamente.

## Puntos que NO PUDIERON VERIFICARSE (declaración final)

- Métricas de runtime del producto: SSIM real con fixtures, <100 ms medidos con imagen 2000×2000, reversibilidad del alfa tras undo, nombres de capa en un ZIP real, manifest validado en ejecución, persistencia tras recarga. Requieren la Fase 6 (por acuerdo del enunciado); protocolos reproducibles en `docs/fixtures/README.md`.
- Validez real de licencias vtracer-wasm / @imgly/background-removal (pendientes de auditoría legal — riesgos R-01/R-02 del plan; ninguna frase afirma "licencia verificada").
- Render de los `.mmd` con mermaid-cli (solo lectura de sintaxis por el árbitro).
- Accesibilidad con lectores de pantalla reales (solo evaluación estructural: roles, aria-labels, headings, `lang="es"`).
- Salto real SQLite→PostgreSQL y Local FS→S3 en producción (solo diseño documentado en ADR-005/ADR-006).

La puerta de entrada de la siguiente iteración es la Definition of Done de §6.4 del plan: cada punto del listón con evidencia ejecutada o con "no verificado" explícito.
