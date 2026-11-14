# AGENTS.md — VectorTinta

Guía operativa para agentes de código (humanos asistidos o LLM) que trabajen en
este repositorio. Lee esto ANTES de tocar cualquier archivo.

## 1. Qué es este proyecto

**VectorTinta** — estudio web de vectorización de imágenes y preparación de
tintas para serigrafía. Pasa de un JPG/PNG/WebP del cliente a capas SVG
separadas por color, con exportación ZIP serigráfica (un SVG por capa +
manifest.json con orden de impresión).

La única ruta visible es `/` (restricción del sandbox): es el producto. La
especificación de la Iteración 1 vive como overlay accesible desde el pie
("Especificación").

## 2. Stack (NO negociable)

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript strict |
| Estilos | Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons |
| Motion | `motion` (framer-motion) — ver §5 |
| Estado | Zustand slices (`src/lib/state/`) |
| BD | Prisma + SQLite (`bun run db:push` tras editar `prisma/schema.prisma`) |
| Auth | JWT propio (jose + argon2), cookies httpOnly |
| Validación | Zod en TODA frontera (config, requests, JSON variable) |
| Almacenamiento | StorageAdapter local (`.data/storage`), diseño swappable a S3 |

## 3. Comandos

```bash
bun run dev        # servidor dev en :3000 (siempre en background; log en dev.log)
bun run lint       # ESLint — debe pasar limpio antes de cualquier commit/entrega
bun run db:push    # aplica prisma/schema.prisma a la BD
```

Prohibido `bun run build`. Verificación final = lint + lectura de `dev.log`
(últimas líneas) + E2E real con agent-browser (snapshot, click en flujo
principal, consola sin errores). "Compila" nunca es suficiente.

## 4. Reglas de arquitectura (duraderas)

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
8. **docs/** es verdad**: si cambias comportamiento, actualiza
   `docs/PLAN-MAESTRO.md`, el ADR afectado y `src/content/spec-data.ts`.

## 5. Motion (obligatorio para UI nueva)

- Usar `motion/react` (`motion.div`, `AnimatePresence`, variants, springs).
- Tokens de motion centralizados en `src/lib/motion.ts` (duraciones, easings,
  springs, variants reutilizables). Nada de números mágicos dispersos.
- Respetar `prefers-reduced-motion` (`useReducedMotion`) en TODA animación.
- Animar transform/opacity (compositor), no layout properties en loops.
- Todo estado interactivo (hover/focus/press) tiene transición; nada "plano".

## 6. Convenciones de código

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

## 7. Testing / verificación (protocolo LISTÓN)

Antes de declarar terminada una tarea:

1. `bun run lint` sin errores.
2. `tail dev.log` — sin stack traces ni 5xx de tu flujo.
3. agent-browser: abre `/`, ejecuta el flujo dorado (guest → proyecto →
   subir imagen → vectorizar → capas → exportar), revisa consola y red.
4. Capturas desktop (1440×900) y móvil (390×844) para validar responsive.
5. worklog.md: append con Task ID, qué, cómo se verificó, qué NO se verificó.

## 8. Trabajo con agentes

- Tareas de exploración/revisión → subagente Explore; auditoría adversarial →
  subagente independiente con Task ID propio (ej. ARB-1).
- Cada subagente recibe: Task ID, alcance, archivos permitidos, qué devolver.
- worklog.md es el registro compartido: append, nunca rewrite.

## 9. Lo que NO se hace

- No añadir rutas nuevas (solo `/`).
- No introducir libs de UI nuevas sin justificar en un ADR.
- No tocar `prisma/schema.prisma` sin correr `db:push` y regenerar.
- No silenciar errores ni tragar promesas (`void p` solo cuando el flujo ya
  maneja el fallo por otra vía).
- No publicar nada con placeholders ("TODO", "…") — cero placeholders.
