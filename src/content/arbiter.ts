/**
 * Datos del INFORME DEL ÁRBITRO.
 *
 * Honestidad epistémica: cada dato que aparece aquí es una verificación REAL
 * ejecutada en el entorno (comandos reproducibles) o una revisión estática
 * declarada como tal.
 * - Ronda 0: autoauditoría del orquestador (corrección FNV-1a, fixtures, grep).
 * - Ronda 1: subagente árbitro adversarial INDEPENDIENTE (Task ARB-1), que
 *   auditó docs + artefactos + visor contra el listón completo y devolvió
 *   veredicto "PASA CON CORRECCIONES MENORES" con 10 rechazos accionables
 *   (R-1..R-10). Su informe íntegro está en worklog.md y docs/INFORME-ARBITRO.md.
 * - Ronda 2: cierre tras aplicar R-1..R-10, con re-verificación ejecutada.
 */

export type ArbiterRound = {
  id: string;
  rol: string;
  veredicto: "pasada" | "rechazada" | "aceptada-con-correcciones";
  hallazgos: { severidad: "alto" | "medio" | "bajo" | "info"; asunto: string; detalle: string; accion: string }[];
  verificado: string[];
  noVerificado: string[];
};

export const arbiterRounds: ArbiterRound[] = [
  {
    id: "Ronda 0 — autoauditoría del orquestador",
    rol: "Orquestador (Z.ai Code), antes de convocar al árbitro independiente",
    veredicto: "aceptada-con-correcciones",
    hallazgos: [
      {
        severidad: "medio",
        asunto: "Digest de configuración con API nativa no portable",
        detalle:
          "La primera versión de app.config.ts calculaba el digest con Bun.SHA256: el archivo se importa en el cliente y esa API no existe en el navegador (habría roto el bundle).",
        accion: "Corregido antes de publicar: digest FNV-1a en TypeScript puro, dependencia cero, computable en navegador y servidor.",
      },
      {
        severidad: "info",
        asunto: "Grep de TODO/FIXME produce falsos positivos en castellano",
        detalle:
          "El patrón 'TODO' coincide con la palabra castellana “TODOS” (p. ej. “TODOS los listados”). No hay marcadores pendientes reales en docs/ ni en src/lib/config.",
        accion: "Documentado como falso positivo; sin corrección necesaria. Comando reproducible: rg -n 'TODO|FIXME|PLACEHOLDER' docs src/lib/config",
      },
    ],
    verificado: [
      "app.config.ts se valida con Zod y ejecuta en runtime real: `bun -e \"await import('./src/lib/config/app.config.ts')\"` → “OK VectorTinta 3 presets digest: fnv1a-…” (el digest se recalcula al editar la configuración: valía fnv1a-79160917 en esa comprobación y fnv1a-1ae24ec7 tras las correcciones R-1..R-10; el valor vigente se muestra en el panel en vivo).",
      "Existencia y tamaño no nulo de los 3 fixtures y de los 14 archivos de docs/ (ls reproducible).",
      "Catálogo de endpoints: los 4 listados (projects, assets, layers, exports) declaran ?limit=&cursor= (revisión estática de la tabla §3.2).",
      "Sin placeholders en la entrega: la iteración declara “solo planificación” y ningún archivo se presenta como implementado.",
    ],
    noVerificado: [
      "Comportamiento del producto en runtime (vectorización, bg-removal, <100 ms, persistencia tras recarga): NO EJECUTABLE en esta iteración por acuerdo del enunciado.",
    ],
  },
  {
    id: "Ronda 1 — árbitro adversarial independiente (Task ARB-1)",
    rol: "Subagente árbitro que no participó en la construcción; auditó docs, artefactos, visor y reprodujo las verificaciones con comandos propios",
    veredicto: "aceptada-con-correcciones",
    hallazgos: [
      {
        severidad: "medio",
        asunto: "R-1 · Cursor de ejemplo mal codificado en el plan (golden erróneo)",
        detalle:
          "El nextCursor de §3.3 decodificaba a “2025-05-30T09:00:00Zp-1” sin el separador “|” declarado en §3.1. El árbitro verificó con printf|base64 que el correcto es MjAyNS0wNS0zMFQwOTowMDowMFp8cC0x.",
        accion: "Corregido en docs/PLAN-MAESTRO.md §3.3 (y re-verificado con printf '2025-05-30T09:00:00Z|p-1' | base64).",
      },
      {
        severidad: "medio",
        asunto: "R-2 · Fixtures con extensión .png pero contenido JPEG real",
        detalle:
          "`file` reveló que los tres “PNG” eran JPEG/JFIF: contaminaría el protocolo SSIM de colores planos y contradecía la narrativa del formato.",
        accion: "Convertidos a PNG real (8-bit RGB, 1024×1024) con sharp y re-verificados con `file`; copia del visor actualizada; nota de procedencia añadida a docs/fixtures/README.md.",
      },
      {
        severidad: "medio",
        asunto: "R-3 · Faltaban cuerpos RFC 7807 de 401, 404-ajeno, 413, 429 y 503",
        detalle: "El listón exige ejemplos concretos por caso; solo había 400 (×2) y 409.",
        accion: "Añadidos al plan (§3.3) y al visor (CodeBlock “Ejemplos de cada clase de error”).",
      },
      {
        severidad: "medio",
        asunto: "R-4 · worklog sin registrar la ejecución real",
        detalle: "El Stage Summary del orquestador seguía en “Pendiente de ejecución” pese a existir todos los artefactos verificados.",
        accion: "Se añade la entrada de ejecución real (comandos y resultados) al worklog.md antes del cierre.",
      },
      {
        severidad: "medio",
        asunto: "R-5 · Referencias muertas (docs/INFORME-ARBITRO.md y docker-compose “del repo”)",
        detalle: "§10 remitía a un archivo inexistente y §6.3 afirmaba que el compose estaba en el repo.",
        accion: "Creado docs/INFORME-ARBITRO.md (rondas 0–2 con datos reales) y reformulada la línea de producción: compose a crear en producción, no incluido en esta iteración.",
      },
      {
        severidad: "bajo",
        asunto: "R-6..R-10 · Precisión de artefactos y contratos",
        detalle:
          "Relleno de {orden} sin declarar; “5 listados” contando el drawer (son 4 endpoints paginados); “localStorage cifrado” sin mecanismo; §9 sin passwordMinLength/argon2; faltaba el ejemplo 200 de GET /api/projects/:id. Además (observaciones no bloqueantes): campo “name” fuera de lugar en el 409 de cuota y ternario siempre-verdadero en el pie del visor.",
        accion: "Aplicado todo: plantilla con token {orden:02d} documentado en app.config.ts/plan; conteo corregido a 4 listados + drawer; mecanismo del borrador descrito con honestidad (cifrado = endurecimiento pendiente); §9 ampliado con passwordMinLength y parámetros argon2; ejemplo GET :id añadido a plan y visor; 409 corregido a errors:[{resource:'projects',…}]; pie del visor muestra el digest real importado (sin copias).",
      },
    ],
    verificado: [
      "El árbitro reprodujo TODAS las verificaciones afirmadas: digest fnv1a-79160917 idéntico, fixtures con bytes, tsc 0, lint 0, HTTP 200 del visor, 375 px sin scroll horizontal, aria/heading/lang=es.",
      "Listón: 13/13 puntos correctamente tipificados (verificado-estático vs no-verificable-hasta-implementación); cero afirmaciones de ejecución inventadas (transversal D confirmada por reproducción).",
      "11/11 ADRs con problema/coste/alternativa descartada; coherencia entre ADRs y PLAN-MAESTRO; riesgos de licencia marcados pending-audit sin ninguna frase que afirme “licencia verificada”.",
      "Conteo de endpoints idéntico entre plan y visor (19), con 4/4 listados paginados por cursor.",
    ],
    noVerificado: [
      "Métricas de runtime del producto (SSIM, <100 ms, reversibilidad del alfa, persistencia tras recarga): sin implementación, por acuerdo del enunciado.",
      "Validez real de licencias vtracer/imgly (correctamente marcadas pending-audit); render de los .mmd (no ejecutó mermaid-cli); lectores de pantalla reales; salto real SQLite→PostgreSQL/S3 en producción.",
    ],
  },
  {
    id: "Ronda 2 — pre-cierre del orquestador tras aplicar R-1..R-10",
    rol: "Orquestador, con re-verificación ejecutada de cada corrección (después confirmada de forma independiente en la Ronda 3)",
    veredicto: "pasada",
    hallazgos: [],
    verificado: [
      "R-1: `printf '2025-05-30T09:00:00Z|p-1' | base64` reproduce el cursor corregido del plan; el valor antiguo queda sin coincidencias en material de contrato vigente (solo subsiste como cita histórica en las actas).",
      "R-2: `file docs/fixtures/*.png` reporta PNG real 1024×1024 8-bit RGB; copias del visor actualizadas.",
      "R-3/R-10: plan y visor incluyen los cuerpos RFC 7807 (401/404-ajeno/413/429/503) y el ejemplo 200 de GET /api/projects/:id.",
      "R-5: docs/INFORME-ARBITRO.md existe con el acta; “docker-compose.yml del repo” queda sin coincidencias en material de contrato vigente.",
      "R-6: `appConfig.export.filePattern` = capa-{orden:02d}-{colorHex}-{layerId}.svg (digest vigente fnv1a-1ae24ec7, recalculado).",
      "R-7/R-8/R-9: conteo 4 listados + drawer; mecanismo del borrador sin promesas de cifrado; §9 con passwordMinLength y argon2.",
      "Suite final: bun run lint → 0/0 · bunx tsc --noEmit → 0 · HTTP 200 en / · 375 px sin scroll horizontal.",
    ],
    noVerificado: [
      "Igual que en Ronda 1: runtime del producto, licencias pendientes de auditoría, mermaid-cli, lectores de pantalla reales y salto real a PostgreSQL/S3. Ver docs/INFORME-ARBITRO.md.",
    ],
  },
  {
    id: "Ronda 3 — verificación independiente del árbitro (Task ARB-2): ACEPTADA",
    rol: "El mismo árbitro adversarial re-ejecutó sus diez rechazos con comandos propios, sin rubber-stamp, y auditó además la propia acta",
    veredicto: "pasada",
    hallazgos: [
      {
        severidad: "bajo",
        asunto: "N-1 / R-6b — el ejemplo del manifest contradecía el token {orden:02d}",
        detalle:
          "Con `order: 0` y token {orden:02d}, el ejemplo mostraba capa-01-… y TINTA-01-… en lugar de capa-00-… / TINTA-00-…. R-6 quedó por tanto PARCIAL en la primera pasada de cierre.",
        accion: "Corregido en plan §3.3 y visor: el ejemplo ahora muestra capa-00-#F2EFE6-l1.svg y TINTA-00-#F2EFE6, coherentes con order: 0 + :02d.",
      },
      {
        severidad: "bajo",
        asunto: "N-2 — frases literales “0 coincidencias” inexactas",
        detalle: "Las actas citan los valores antiguos como historia, así que “0 coincidencias” a secas era literalmente falso.",
        accion: "Reformulado en acta y visor: “0 coincidencias en material de contrato vigente”.",
      },
      {
        severidad: "medio",
        asunto: "N-3 — veredicto pre-escrito antes de la verificación independiente",
        detalle:
          "El acta describía como “Ronda 2 del árbitro” lo que era la re-verificación del orquestador; pre-escribir el veredicto de una auditoría pendiente es una falta de procedimiento.",
        accion: "Acta reescrita con la secuencia real: pre-cierre del orquestador (Ronda 2) → verificación independiente ARB-2 (esta ronda), que confirmó 9/10 OK + R-6 parcial → R-6b aplicado. Veredicto final: ACEPTADA como planificación.",
      },
    ],
    verificado: [
      "ARB-2 confirmó con comandos propios: R-1..R-5 y R-7..R-10 OK; regresión verde (lint 0/0, tsc 0, HTTP 200, 375 px sin scroll horizontal, fixtures PNG cargadas, digest vigente en el DOM).",
      "Listón 1–7: correctamente tipificados como no-verificables-hasta-implementación. Listón 8–13 y transversales A–H: verificados estáticos en regla.",
      "Las salvedades N-1..N-3 (mecánicas, verificables por grep) quedaron resueltas en esta entrega; el veredicto final del árbitro es ACEPTADA como planificación.",
    ],
    noVerificado: [
      "Runtime del producto (SSIM, <100 ms, reversibilidad del alfa, persistencia tras recarga), licencias vtracer/imgly pendientes de auditoría legal, render de .mmd con mermaid-cli, lectores de pantalla reales y salto real a PostgreSQL/S3. Declaración final en docs/INFORME-ARBITRO.md.",
    ],
  },
];

export const arbiterResumen = {
  rondas: 4,
  nota:
    "Ronda 0: autoauditoría con corrección preventiva. Ronda 1: árbitro adversarial independiente (Task ARB-1) → PASA CON CORRECCIONES MENORES con 10 rechazos accionables (R-1..R-10). Ronda 2: el orquestador aplica y re-verifica las correcciones (pre-cierre). Ronda 3: el árbitro re-verifica de forma independiente (Task ARB-2) → ACEPTADA, con salvedades N-1..N-3 resueltas en el acto. Ningún punto del listón se declara verificado en runtime del producto: no procede en una iteración de solo planificación.",
};
