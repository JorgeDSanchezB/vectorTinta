# AGENTS.md — VectorTinta

Guía operativa para agentes de código (humanos asistidos o LLM) que trabajen en
este repositorio. Lee esto ANTES de tocar cualquier archivo: es la memoria
canónica del proyecto y evita repetir trabajo ya hecho.

## 1. Qué es este proyecto

**VectorTinta** — estudio web de vectorización de imágenes y preparación de
tintas para serigrafía. Pasa de un JPG/PNG/WebP del cliente a capas SVG
separadas por color, con exportación ZIP serigráfica (un SVG por capa +
manifest.json con orden de impresión).

La única ruta visible es `/` (restricción del sandbox): es el producto, con dos
modos — landing/Acceso (tema claro «taller») y Studio/Workspace (tema oscuro
«mesa de tinta»). La especificación vive como overlay accesible desde el pie
(«Especificación»).

## 2. Estado actual (leer antes de "arreglar" algo que ya está hecho)

| Entrega | Estado | Clave |
|---|---|---|
| Plan maestro + ADRs + especificación (Iteración 1) | DONE | `docs/PLAN-MAESTRO.md`, `docs/decisions/`, informe árbitro ARB-1 |
| Implementación funcional: guest → proyecto → subir → vectorizar → capas → tintas → exportar | DONE | flujo dorado E2E verificado con agent-browser |
| FIX-1: subida de imágenes grandes | DONE | ADR-013: el navegador adapta (escala + recodifica), el servidor revalida |
| UI-V3: rediseño integral del workspace «Mesa de Tinta» | DONE | árbitro adversarial aprobó 9/10 (desktop, móvil, tintas) |
| Detector determinista de colisiones de texto | DONE | herramienta permanente en `.audit/overlap-check.js` |

Regla: si una tarea parece pendiente pero está en esta tabla, NO repetirla.
El registro cronológico completo vive en `worklog.md` (append-only).

## 3. Stack (NO negociable)

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript strict |
| Estilos | Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons |
| Motion | `motion/react` (framer-motion) — ver §6 |
| Estado | Zustand slices (`src/lib/state/`) |
| BD | Prisma + SQLite (`bun run db:push` tras editar `prisma/schema.prisma`) |
| Auth | JWT propio (jose + argon2), cookies httpOnly |
| Validación | Zod en TODA frontera (config, requests, JSON variable) |
| Almacenamiento | StorageAdapter local (`.data/storage`), diseño swappable a S3 |

## 4. Comandos

```bash
bun run dev        # servidor dev en :3000 (siempre en background; log en dev.log)
bun run lint       # ESLint — debe pasar limpio antes de cualquier commit/entrega
bun run db:push    # aplica prisma/schema.prisma a la BD
node .audit/overlap-check.js   # (ver §9) detector de colisiones, requiere navegador abierto
```

Prohibido `bun run build`. Verificación final = lint + lectura de `dev.log`
(últimas líneas) + E2E real con agent-browser (snapshot, click en flujo
principal, consola sin errores). "Compila" nunca es suficiente.

## 5. Reglas de arquitectura (duraderas)

1. **CERO hardcoding de valores de negocio.** Todos los límites/cuotas/paletas
   viven en `src/lib/config/app.config.ts` validado con Zod. Si un número de
   dominio aparece dos veces, es un bug.
2. **RFC 7807 en toda respuesta de error** (`src/lib/http/problem.ts`); el
   cliente trata problemas tipados, nunca strings.
3. **El pesado va en el cliente** (ADR-001/003): vectorización y bg-removal en
   Web Workers cancelables; servidor solo persiste y revalida.
4. **Edición optimista**: estado local primero, PATCH después, revertir si el
   servidor rechaza (nunca "arreglar en silencio").
5. **Registros, no switches** (ADR-008): presets/exporters/operaciones se
   añaden por manifiesto + esquema; tocar el núcleo = fallar la revisión.
6. **Paginación por cursor compuesto** (ADR-010) en TODOS los listados.
7. **Subidas que exceden límites se adaptan, no se rechazan** (ADR-013,
   `src/lib/image/fit-to-limits.ts`): escala + recodificación alfa-safe en el
   navegador; el servidor revalida el resultado con sharp + sha-256.
8. **docs/ es verdad**: si cambias comportamiento, actualiza
   `docs/PLAN-MAESTRO.md`, el ADR afectado y `src/content/spec-data.ts`.

## 6. Motion (obligatorio para UI nueva)

- Usar `motion/react` (`motion.div`, `AnimatePresence`, variants, springs).
- Tokens de motion centralizados en `src/lib/motion.ts` (duraciones, easings,
  springs, variants reutilizables). Nada de números mágicos dispersos.
- Respetar `prefers-reduced-motion` (`useReducedMotion`) en TODA animación.
- Animar transform/opacity (compositor), no layout properties en loops.
  Excepción válida: mutación directa de `style.transform` fuera de React para
  efectos de seguimiento de puntero (ver foco del VectorStage).
- Todo estado interactivo (hover/focus/press) tiene transición; nada "plano".

## 7. Design system v3 «Mesa de Tinta» (UI-V3, vigente)

El workspace NO es un dashboard genérico: es un editor pro con metáfora de
mesa de serigrafía. Respeta estos tokens y patrones:

- **Scoping**: todas las variables viven bajo `.vt-studio`, aplicado al
  `<body>` mientras el workspace está montado → TODOS los portales (Sheet,
  Dialog, Popover, toasts de sonner) heredan el tema oscuro. No duplicar vars.
- **Cromo**: tinta cálida `#17130e` (fondo), paneles `#1f1a13`, cobre
  `#c12841` como acción/selección, `--vt-copper` para texto acento.
- **La obra va en PAPEL**: el arte vive en una hoja clara (`.vt-sheet`) con
  sombra real sobre la mesa oscura (`.vt-desk`, grano + viñeta + foco que
  sigue al puntero). El checker de transparencia va DENTRO de la hoja.
- **Clases firma** (globals.css): `.vt-desk`, `.vt-sheet`, `.vt-panel` (bisel
  + borde translúcido + sombra en capas), `.vt-btn-copper`, `.vt-label`
  (rótulos mayúsculas con tracking), `.vt-scroll-fade` (máscara de fade real).
- **Inspector**: fila = label (`min-w-0 truncate`) + input numérico
  (`shrink-0`) + unidad FUERA del input (`w-10 truncate` — el sufijo interno
  solapaba números; no revertir) + slider full-width debajo; separador cuando
  cambia el TIPO de campo.
- **Listas flex acotadas**: cualquier `overflow-hidden` en un flex-col anula
  `min-height:auto` — usa `shrink-0` explícito en las filas (bug real de filas
  62px→26px, ya corregido).
- **La landing queda en tema claro**: narrativa «entras al taller (papel) y te
  sientas en la mesa de tinta (oscuro)». No oscurecerla sin orden expresa.

## 8. Convenciones de código

- `use client` para componentes con interacción; API routes sin él.
- shadcn/ui primero: no reinventar Button/Card/Dialog (están en
  `src/components/ui`).
- Formularios y bordes: feedback de carga/error SIEMPRE visible
  (`PanelStates`, toasts de sonner).
- Tailwind: clases semánticas (`bg-background`, `text-muted-foreground`…);
  paleta del tema en `globals.css` — NO introducir colores indigo/azul fuera
  del sistema.
- TypeScript strict: sin `any`; errores de dominio tipados.
- Accesibilidad: roles ARIA, `aria-label` en botones icónicos, foco visible,
  objetivo táctil ≥ 44px.
- En móvil: inputs sin `min-width` intrínseco (usar `w-full min-w-0`); header
  sticky con fondo OPACO (el translúcido deja translucir contenido — defecto
  real ya corregido).

## 9. Testing / verificación (protocolo LISTÓN)

Antes de declarar terminada una tarea:

1. `bun run lint` sin errores.
2. `tail dev.log` — sin stack traces ni 5xx de tu flujo.
3. agent-browser: abre `/`, ejecuta el flujo dorado (guest → proyecto →
   subir imagen → vectorizar → capas → exportar), revisa consola y red.
4. **Detector de colisiones** (`.audit/overlap-check.js`): con el navegador
   abierto en cada estado relevante (workspace vacío/poblado, tintas,
   exportar, drawer, móvil a 390px), valida que haya 0 colisiones, 0 overflow
   horizontal y 0 textos cortados. Es geométrico (DOM), no visual — la prueba
   que el árbitro de UI-V2 no tenía y aprobó defectos visibles.
5. Capturas desktop (1440×900) y móvil (390×844) para validar responsive.
6. worklog.md: append con Task ID, qué, cómo se verificó, qué NO se verificó.

## 10. Árbitro adversarial (protocolo)

Para cambios de UI/UX significativos, un subagente árbitro independiente
audita con capturas multi-estado. Reglas duras aprendidas:

- El árbitro NUNCA aprueba con defectos conocidos de legibilidad/overlap: si
  el detector (§9.4) reporta colisiones, el veredicto es RECHAZADO sin más.
- Calificación numérica + nits separados en bloqueantes vs no bloqueantes.
- Mínimo 2 rondas de corrección si hay rechazo; re-auditar lo corregido.
- Aprobar ≠ "se ve bien": aprobar = pasa checklist adversarial (legibilidad,
  jerarquía, affordances de scroll/recorte, estados vacíos, responsive).

## 11. Trabajo con agentes

- Tareas de exploración/revisión → subagente Explore; auditoría adversarial →
  subagente independiente con Task ID propio (ej. ARB-1, UI-V3).
- Cada subagente recibe: Task ID, alcance, archivos permitidos, qué devolver.
- worklog.md es el registro compartido: append, nunca rewrite.

## 12. Índice de ADRs (`docs/decisions/`)

| ADR | Tema |
|---|---|
| 000 | Entorno y stack |
| 001 | Vectorizador WASM en cliente |
| 002 | SVG nativo vs Konva |
| 003 | Modelo de Web Workers |
| 004 | Estado Zustand por slices |
| 005 | Persistencia Prisma SQLite → Postgres |
| 006 | Storage adapter local → S3 |
| 007 | Autenticación JWT + argon2 |
| 008 | Registros vs switch |
| 009 | Bg-removal ONNX en cliente |
| 010 | Paginación cursor compuesto |
| 011 | Acceso invitado |
| 012 | Deltas de implementación |
| 013 | Adaptación automática de subidas |

## 13. Respaldo Git

- Remoto: `origin` → `github.com/JorgeDSanchezB/vectorTinta` (rama `main`,
  tracking configurado). Respaldo = `git add -A && git commit && git push`.
- El token de acceso vive solo en `.git/config` (local, nunca se sube).
- `.gitignore` ya excluye `node_modules`, `.next/`, logs, `.env*`; la BD
  `db/custom.db` SÍ va al respaldo a propósito.

## 14. Lo que NO se hace

- No añadir rutas nuevas (solo `/`).
- No introducir libs de UI nuevas sin justificar en un ADR.
- No tocar `prisma/schema.prisma` sin correr `db:push` y regenerar.
- No silenciar errores ni tragar promesas (`void p` solo cuando el flujo ya
  maneja el fallo por otra vía).
- No publicar nada con placeholders ("TODO", "…") — cero placeholders.
- No repetir entregas ya completadas (ver §2) ni "mejorar" por gusto lo que
  el árbitro ya aprobó sin una orden explícita del usuario.
