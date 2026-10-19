/**
 * Datos estructurados del visor de la especificación VectorTinta.
 * Fuentes: docs/PLAN-MAESTRO.md y docs/decisions/*.md (texto canónico allí).
 * Los valores de negocio mostrados en el panel "en vivo" provienen de
 * src/lib/config/app.config.ts (importado directamente, sin copias).
 */

export type PhaseMeta = {
  id: string;
  label: string;
  title: string;
  icon: string; // nombre de icono Lucide resuelto en el componente
};

export const phases: PhaseMeta[] = [
  { id: "resumen", label: "0", title: "Resumen", icon: "scroll-text" },
  { id: "fase-1", label: "1", title: "Plan estratégico", icon: "compass" },
  { id: "fase-2", label: "2", title: "Modelado de datos", icon: "database" },
  { id: "fase-3", label: "3", title: "Contratos API", icon: "satellite-dish" },
  { id: "fase-4", label: "4", title: "Inserción extensible", icon: "brain" },
  { id: "fase-5", label: "5", title: "Renderizado y listas", icon: "monitor" },
  { id: "fase-6", label: "6", title: "Código (preparada)", icon: "code" },
  { id: "liston", label: "★", title: "Listón de calidad", icon: "gauge" },
  { id: "arbitro", label: "⚖", title: "Informe del árbitro", icon: "scale" },
  { id: "anexos", label: "A", title: "Anexos", icon: "folder-tree" },
];

export type EndpointRow = {
  method: "POST" | "GET" | "PATCH" | "DELETE";
  path: string;
  auth: string;
  rate: string;
  paginated: boolean;
  errors: string;
};

export const endpoints: EndpointRow[] = [
  { method: "POST", path: "/api/auth/register", auth: "—", rate: "auth", paginated: false, errors: "400 · 409 email existente" },
  { method: "POST", path: "/api/auth/login", auth: "—", rate: "auth", paginated: false, errors: "401 credenciales" },
  { method: "POST", path: "/api/auth/refresh", auth: "cookie/body", rate: "auth", paginated: false, errors: "401 revocado/expirado" },
  { method: "POST", path: "/api/projects", auth: "Bearer", rate: "mutaciones", paginated: false, errors: "400 · 409 cuota" },
  { method: "GET", path: "/api/projects?limit=&cursor=", auth: "Bearer", rate: "general", paginated: true, errors: "400 límites" },
  { method: "GET", path: "/api/projects/:id", auth: "Bearer", rate: "general", paginated: false, errors: "401 · 404" },
  { method: "PATCH", path: "/api/projects/:id", auth: "Bearer", rate: "mutaciones", paginated: false, errors: "400 · 404" },
  { method: "DELETE", path: "/api/projects/:id", auth: "Bearer", rate: "mutaciones", paginated: false, errors: "404" },
  { method: "POST", path: "/api/projects/:id/assets", auth: "Bearer", rate: "mutaciones", paginated: false, errors: "413 tamaño · 400 MIME/dims · 409 cuota" },
  { method: "GET", path: "/api/projects/:id/assets?limit=&cursor=", auth: "Bearer", rate: "general", paginated: true, errors: "404" },
  { method: "POST", path: "/api/projects/:id/vectorize", auth: "Bearer", rate: "mutaciones", paginated: false, errors: "400 preset/params · 409 maxLayers" },
  { method: "POST", path: "/api/projects/:id/layers", auth: "Bearer", rate: "mutaciones", paginated: false, errors: "400 · 409 maxLayers" },
  { method: "GET", path: "/api/projects/:id/layers?limit=&cursor=", auth: "Bearer", rate: "general", paginated: true, errors: "404" },
  { method: "PATCH", path: "/api/projects/:id/layers/:layerId", auth: "Bearer", rate: "mutaciones", paginated: false, errors: "400 colorHex/orden · 404" },
  { method: "POST", path: "/api/projects/:id/exports", auth: "Bearer", rate: "mutaciones", paginated: false, errors: "400 formato · 409 cuota diaria" },
  { method: "GET", path: "/api/projects/:id/exports?limit=&cursor=", auth: "Bearer", rate: "general", paginated: true, errors: "404" },
  { method: "GET", path: "/api/assets/:key", auth: "Bearer", rate: "general", paginated: false, errors: "401 · 404 (streaming autorizado)" },
  { method: "GET", path: "/api/health", auth: "—", rate: "—", paginated: false, errors: "—" },
  { method: "GET", path: "/api/metrics", auth: "— (prod: interno)", rate: "—", paginated: false, errors: "—" },
];

export type ListonStatus = "verificado" | "estatico" | "pendiente";

export type ListonItem = {
  n: number;
  punto: string;
  status: ListonStatus;
  evidencia: string;
  reproduccion: string;
};

export const liston: ListonItem[] = [
  {
    n: 1,
    punto: "Vectorización fiel (SSIM ≥ 0,92 con presets por defecto)",
    status: "pendiente",
    evidencia: "Diseño con presets por caso de uso, métrica y umbral acordados; fixtures de 3 casos límite generados.",
    reproduccion: "docs/fixtures/README.md → Verificación 1 (comando scikit-image / ImageMagick) cuando exista implementación.",
  },
  {
    n: 2,
    punto: "Eliminación de fondo en cliente, sin subir la imagen, reversible",
    status: "pendiente",
    evidencia: "ADR-009: engine ONNX en Worker; la máscara alfa es un comando del historial (undo restaura). Diseño sin salida de red del raster.",
    reproduccion: "docs/fixtures/README.md → Verificación 3 (DevTools Network + histograma de alfa tras undo).",
  },
  {
    n: 3,
    punto: "Recoloreo por zona con selección en lienzo, preview instantáneo y undo/redo",
    status: "pendiente",
    evidencia: "§5.3 del plan: hit-test DOM + mutación de fill fuera del render de React; comando RecolorLayersCommand con pila acotada.",
    reproduccion: "docs/fixtures/README.md → Verificación 2 (user timing p50/p95 por operación).",
  },
  {
    n: 4,
    punto: "Separación en capas con export SVG por capa y nombres estables",
    status: "pendiente",
    evidencia: "Patrón de nombre en configuración: capa-{orden:02d}-{colorHex}-{layerId}.svg (app.config.ts → export.filePattern; {orden:02d} = relleno a 2 dígitos).",
    reproduccion: "Al implementar: exportar ZIP y verificar que los nombres siguen la plantilla de configuración.",
  },
  {
    n: 5,
    punto: "Exportación serigráfica: vista de tintas (HEX+nombre, área, marca única) + ZIP con manifest.json",
    status: "pendiente",
    evidencia: "Vista InkPrepView (§5.1) y esquema del manifest (§3.3) con printOrder, inkMark y coveragePercent; estrategia configurable.",
    reproduccion: "Al implementar: descargar ZIP, validar manifest contra el esquema Zod del ExporterRegistry.",
  },
  {
    n: 6,
    punto: "Interfaz <100 ms en selección/arrastre/recolor con imagen 2000×2000",
    status: "pendiente",
    evidencia: "Presupuesto por operación (§5.3) con mecanismos y complejidades declaradas: hit-test O(profundidad), recolor O(paths capa), zoom O(1).",
    reproduccion: "docs/fixtures/README.md → Verificación 2: 20 repeticiones, reportar p50/p95, sin longtask >50 ms.",
  },
  {
    n: 7,
    punto: "Persistencia completa recuperable tras recarga",
    status: "pendiente",
    evidencia: "Modelo (§2) + contratos (§3): GET /api/projects/:id reconstruye origen, vectorización, capas, colores y exportaciones.",
    reproduccion: "Al implementar: e2e Playwright (recargar y comparar estado del lienzo).",
  },
  {
    n: 8,
    punto: "Extensibilidad demostrable (preset “cómic” / exportador “pdf” sin tocar núcleo)",
    status: "estatico",
    evidencia: "Flujo UI → Config schema → Registry → Pipeline → ExporterRegistry documentado §4.4 y §7; manifiestos reales en app.config.ts.",
    reproduccion: "Leer §7 + src/lib/config/app.config.ts (presetManifest/export.formats) + ADR-008.",
  },
  {
    n: 9,
    punto: "Tolerancia a fallos: 7 clases distinguidas con ejemplos y tratamiento",
    status: "verificado",
    evidencia: "docs/decisions/failure-modes.md: ausente/nulo/inválido/temporal/autorización/configuración/crítico con caso concreto del producto y severidad UI.",
    reproduccion: "Abrir docs/decisions/failure-modes.md y recorrer la matriz de severidad.",
  },
  {
    n: 10,
    punto: "Cero placeholders, TODOs o archivos incompletos presentados como terminados",
    status: "verificado",
    evidencia: "Entrega declarada “solo planificación”: no se presenta código del producto como terminado. Grep TODO/FIXME en docs y config: sin marcadores (solo el castellano “TODOS”).",
    reproduccion: "rg -n 'TODO|FIXME|PLACEHOLDER' docs src/lib/config",
  },
  {
    n: 11,
    punto: "Cero hardcoding: límites, capas, colores, formatos y presets en configuración validada",
    status: "verificado",
    evidencia: "src/lib/config/app.config.ts real: Zod en arranque, digest fnv1a, 3 presets, 12 tintas, 2 formatos, plantillas de nombre y umbral de virtualización como datos.",
    reproduccion: "bun -e \"await import('./src/lib/config/app.config.ts')\" — valida y expone el digest.",
  },
  {
    n: 12,
    punto: "Escalabilidad: paginación ?limit=&cursor= en todo listado, virtualización, SELECT explícito, complejidad declarada",
    status: "verificado",
    evidencia: "19 endpoints; 4 listados paginados por cursor compuesto (projects, assets, layers, exports) más el drawer como consumidor (ADR-010); react-window >50 nodos; SELECT explícito exigido; tabla de complejidades §1.10.",
    reproduccion: "Revisar §3.2 (columna Paginación) y ADR-010; implementación con select explícito por endpoint.",
  },
  {
    n: 13,
    punto: "Anti-sobreingeniería: cada patrón declara problema/coste/alternativa descartada",
    status: "verificado",
    evidencia: "Tabla D-01..D-11 (§1.8) + 11 ADRs con las tres secciones obligatorias; registros justificados frente a switch con coste acotado (ADR-008).",
    reproduccion: "Recorrer docs/decisions/ADR-*.md: sección “Alternativas descartadas” presente en cada uno.",
  },
];

export type AdrSummary = { id: string; title: string; gist: string; file: string };

export const adrs: AdrSummary[] = [
  { id: "ADR-000", title: "Entorno y stack: Next.js 16 unificado", gist: "Restricción real de 1 puerto; puertos/adaptadores para que Fastify+Postgres+S3 sean sustitución, no rediseño.", file: "ADR-000-entorno-y-stack.md" },
  { id: "ADR-001", title: "Vectorizador WASM en cliente", gist: "Coste/latencia/privacidad; puerto con dos motores por riesgo de licencia (vtracer pendiente de auditoría, imagetracer dominio público).", file: "ADR-001-vectorizador-wasm-cliente.md" },
  { id: "ADR-002", title: "SVG nativo vs Konva", gist: "El dato ya es SVG: hit-test y recolor nativos, export = serializar; Konva como candidato para el raster, no para el lienzo vectorial.", file: "ADR-002-svg-nativo-vs-konva.md" },
  { id: "ADR-003", title: "1 worker por tarea, cancelable", gist: "O(píxeles) fuera del hilo principal; pool genérico descartado por anti-sobreingeniería.", file: "ADR-003-modelo-web-workers.md" },
  { id: "ADR-004", title: "Zustand slices + TanStack Query", gist: "Estado de sesión local de alta frecuencia vs estado de servidor cacheado; Redux/Context descartados.", file: "ADR-004-estado-zustand-slices.md" },
  { id: "ADR-005", title: "Prisma SQLite → PostgreSQL", gist: "Esquema dialecto-agnóstico; enums en el borde con Zod; migración = provider + prisma migrate.", file: "ADR-005-persistencia-prisma-sqlite-a-postgres.md" },
  { id: "ADR-006", title: "StorageAdapter local → S3", gist: "Binarios fuera de la BD; claves opacas servidas por streaming autorizado; disco local acoplado descartado.", file: "ADR-006-storage-adapter-local-a-s3.md" },
  { id: "ADR-007", title: "JWT acceso+refresco con jose y argon2", gist: "Contrato del enunciado; rotación con tabla RefreshToken; NextAuth v4 descartado por su flujo credentials+refresh.", file: "ADR-007-autenticacion-jwt-argon2.md" },
  { id: "ADR-008", title: "Registros con esquemas vs switch", gist: "Preset/Exporter/Operation/SelectionRegistry construidos desde manifiestos de configuración; coste estrictamente acotado.", file: "ADR-008-registros-vs-switch.md" },
  { id: "ADR-009", title: "Bg-removal ONNX en cliente", gist: "Sin subir la imagen; dos adaptadores (imgly pendiente de licencia, U²-Net Apache-2.0); máscara reversible por diseño.", file: "ADR-009-bg-removal-onnx-cliente.md" },
  { id: "ADR-010", title: "Cursor compuesto (createdAt,id)", gist: "Orden estable bajo concurrencia; índices compuestos por listado; OFFSET descartado.", file: "ADR-010-paginacion-cursor-compuesto.md" },
];

export const risks: { n: string; riesgo: string; prob: string; impacto: string; mitigacion: string }[] = [
  { n: "R-01", riesgo: "Licencias del motor WASM (vtracer restrictiva, potrace GPL)", prob: "Media", impacto: "Alto", mitigacion: "Puerto con 2 adaptadores; auditoría de licencia como bloqueo declarado; fallback dominio público" },
  { n: "R-02", riesgo: "Licencia de bg-removal (imgly con condiciones; modelo U²-Net Apache-2.0)", prob: "Media", impacto: "Alto", mitigacion: "Adaptador alternativo ONNX documentado; no se elige licencia sin verificación" },
  { n: "R-03", riesgo: "Calidad perceptual insuficiente en fotos", prob: "Media", impacto: "Alto", mitigacion: "Presets por caso de uso + SSIM ≥ 0,92 con fixtures reproducibles" },
  { n: "R-04", riesgo: "Memoria/rendimiento con imágenes grandes", prob: "Media", impacto: "Medio", mitigacion: "maxPixels en config, workers cancelables, degradación explícita" },
  { n: "R-05", riesgo: "Móvil lento con WASM/ONNX", prob: "Alta", impacto: "Medio", mitigacion: "Supuesto S-03: banner + bloqueo de O(píxeles) bajo 900 px de viewport" },
  { n: "R-06", riesgo: "Abuso de cuota/almacenamiento", prob: "Media", impacto: "Medio", mitigacion: "Cuotas en config + rate limiting + AuditEvent" },
  { n: "R-07", riesgo: "SQLite sin concurrencia alta (solo sandbox)", prob: "Baja", impacto: "Bajo", mitigacion: "ADR-005: salto a PostgreSQL = provider + migraciones" },
  { n: "R-08", riesgo: "Sin entorno de ejecución del producto en esta iteración", prob: "Cierta", impacto: "Medio", mitigacion: "Honestidad epistémica: verificación estática + protocolos reproducibles" },
];

export const decisions: { id: string; decision: string; problema: string; coste: string; descartada: string }[] = [
  { id: "D-01", decision: "Vectorización WASM en cliente", problema: "Coste/latencia de servidor + privacidad", coste: "Bundle 1–2 MiB, memoria del tab", descartada: "Vectorizar en servidor" },
  { id: "D-02", decision: "SVG nativo interactivo", problema: "El dato ya es SVG: recolor/hit-test/export nativos", coste: "DOM con >>10⁴ nodos (mitigado por capas)", descartada: "Konva/Fabric (doble estado)" },
  { id: "D-03", decision: "Workers: 1 por tarea, cancelable", problema: "No congelar el hilo principal", coste: "Orquestación de mensajes tipados", descartada: "Hilo principal / pool genérico" },
  { id: "D-04", decision: "Zustand con slices", problema: "Estado local de alta frecuencia sin re-render global", coste: "Disciplina de selectores", descartada: "Redux Toolkit" },
  { id: "D-05", decision: "Prisma SQLite → PostgreSQL", problema: "Persistencia relacional portable", coste: "Enums → Zod en el borde", descartada: "Mongo/NoSQL (datos relacionales)" },
  { id: "D-06", decision: "StorageAdapter local→S3", problema: "Objetos portables y privados", coste: "Una indirección", descartada: "Disco local acoplado" },
  { id: "D-07", decision: "JWT acceso+refresco (jose+argon2)", problema: "Contrato del enunciado con rotación/revocación", coste: "Tabla RefreshToken", descartada: "NextAuth v4 credentials" },
  { id: "D-08", decision: "Registros con esquemas", problema: "Extensión sin tocar núcleo (regla del carro)", coste: "Indirección acotada y versionada", descartada: "switch central" },
  { id: "D-09", decision: "Bg-removal ONNX en cliente", problema: "Privacidad + coste cero de servidor", coste: "Descarga de modelo con consentimiento", descartada: "API externa (subiría la imagen)" },
  { id: "D-10", decision: "Cursor compuesto (createdAt,id)", problema: "Paginación estable bajo concurrencia", coste: "Codificación base64url + OR", descartada: "OFFSET/LIMIT" },
  { id: "D-11", decision: "Next.js 16 unificado", problema: "Restricción real: 1 puerto, 1 servicio", coste: "API sin escalado independiente en sandbox", descartada: "Fastify separado ahora (sin beneficio real)" },
];

export const entities: { nombre: string; campos: string; invariantes: string }[] = [
  { nombre: "User", campos: "id, email(único), name?, passwordHash, plan, timestamps", invariantes: "email RFC; password ≥ 10 (config); passwordHash jamás en SELECT público" },
  { nombre: "RefreshToken", campos: "id, userId, tokenHash(sha-256), expiresAt, revokedAt?", invariantes: "rotación en cada uso; un token vale 1 vez" },
  { nombre: "Project", campos: "id, ownerId, name, description?, thumbnailKey?, timestamps", invariantes: "name 1..80 (config); cuota 20 (config) → 409" },
  { nombre: "Asset", campos: "id, projectId, role, mimeType, width, height, bytes, storageKey, checksum", invariantes: "MIME ∈ allowlist; bytes/dims ≤ config; checksum sha-256" },
  { nombre: "Vectorization", campos: "id, assetId, engineId, presetId, params(Json), schemaVersion, svgStorageKey, nodeCount", invariantes: "params valida contra el esquema del preset; nodeCount > 0" },
  { nombre: "Layer", campos: "id, vectorizationId, orden, colorHex, name, svgFragmentKey, areaPx, visible", invariantes: "colorHex ^#[0-9A-Fa-f]{6}$; orden único por vectorización" },
  { nombre: "Export", campos: "id, projectId, formatId, storageKey, manifest(Json), schemaVersion", invariantes: "manifest valida contra el esquema del formato" },
  { nombre: "AuditEvent", campos: "id, userId?, projectId?, action, metadata(Json), createdAt", invariantes: "solo añadir; sin PII en metadata (guard Fase 4)" },
];

export const perfBudget: { operacion: string; mecanismo: string; complejidad: string; presupuesto: string }[] = [
  { operacion: "Selección de zona", mecanismo: "pointerdown + closest('[data-layer-id]') — hit-test nativo", complejidad: "O(profundidad)", presupuesto: "< 10 ms" },
  { operacion: "Recoloreo", mecanismo: "mutación de fill por refs (fuera del render de React) + comando historial", complejidad: "O(paths capa)", presupuesto: "< 16 ms (1 frame)" },
  { operacion: "Zoom / pan", mecanismo: "mutación de viewBox en toolSlice (no re-renderiza capas)", complejidad: "O(1)", presupuesto: "< 16 ms" },
  { operacion: "Reordenar capas", mecanismo: "dnd-kit sobre lista virtualizada → ReorderLayerCommand", complejidad: "O(visible)", presupuesto: "< 50 ms" },
  { operacion: "Aislar capa", mecanismo: "toggle display del resto", complejidad: "O(n capas ≤ 30)", presupuesto: "< 30 ms" },
];

export const failureModes: { clase: string; ejemplo: string; tratamiento: string }[] = [
  { clase: "Opcional ausente", ejemplo: "project.description no enviado", tratamiento: "default solo si el esquema del preset/campo lo declara; UI “—”; sin toast" },
  { clase: "Valor nulo (nullable)", ejemplo: "layer.name === null en datos leídos", tratamiento: "nombre derivado “Capa 03” + chip informativo; nunca default silencioso" },
  { clase: "Dato inválido", ejemplo: "colorHex \"#12\" en PATCH", tratamiento: "400 RFC 7807 con campo exacto; en lectura: color de rescate #FF00FF + chip visible" },
  { clase: "Temporal", ejemplo: "timeout subiendo el ZIP", tratamiento: "backoff x3 + toast Reintentar; trabajo local no se pierde" },
  { clase: "Autorización", ejemplo: "token caducado; proyecto ajeno", tratamiento: "refresh transparente; 404 deliberado para ajenos (no filtrar existencia)" },
  { clase: "Configuración", ejemplo: "NEXT_PUBLIC_BG_REMOVAL_MODEL_URL ausente", tratamiento: "banner con el nombre exacto de la variable; arranque falla rápido en servidor" },
  { clase: "Crítico", ejemplo: "OOM del worker de vectorización", tratamiento: "modal + “Recuperar espacio de trabajo” + export de diagnóstico" },
];

export const validationSteps: { paso: string; detalle: string }[] = [
  { paso: "1 · Tamaño", detalle: "bytes > config.limits.json.maxBytes (8 KiB) → 400 antes de parsear" },
  { paso: "2 · Profundidad", detalle: "walker determinista; > maxDepth (4) → 400" },
  { paso: "3 · Claves peligrosas", detalle: "__proto__ / prototype / constructor → 400 (se rechazan, no se ignoran)" },
  { paso: "4 · Guard anti-PII", detalle: "patrones email/teléfono → 400 con hint accionable" },
  { paso: "5 · Registro", detalle: "PresetRegistry.get(presetId); inexistente → 400 con supportedPresets" },
  { paso: "6 · safeParse estricto", detalle: "desconocidos y tipos mal con detalle por campo; rangos del preset" },
  { paso: "7 · Versionado", detalle: "se guarda { values, schemaVersion }; al leer: migradores encadenados + revalidación" },
];

export const docsIndex: { ruta: string; contenido: string }[] = [
  { ruta: "docs/PLAN-MAESTRO.md", contenido: "Documento canónico: Fases 1–5 + Fase 6 preparada + informe del árbitro" },
  { ruta: "docs/decisions/ADR-000…010", contenido: "11 ADRs con problema / coste / alternativa descartada" },
  { ruta: "docs/decisions/failure-modes.md", contenido: "7 clases de fallo con ejemplos del producto y matriz de severidad UI" },
  { ruta: "docs/diagrams/*.mmd", contenido: "Arquitectura, flujo de vectorización y ER (Mermaid + guía de render)" },
  { ruta: "docs/fixtures/", contenido: "3 fixtures generados con IA + protocolos SSIM/perf/reversibilidad" },
  { ruta: "src/lib/config/app.config.ts", contenido: "Artefacto real de Fase 6: configuración validada con Zod (digest fnv1a)" },
  { ruta: "worklog.md", contenido: "Registro de trabajo compartido por los agentes (trazabilidad del proceso)" },
];
