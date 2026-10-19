# Modos de fallo — clasificación, ejemplos y tratamiento (obligatorio del listón)

La app distingue y trata de forma **explícita y diferente** las siete situaciones siguientes. Regla general: los defaults solo cubren *opcionales ausentes definidos por esquema*; ningún error importante se convierte silenciosamente en un valor por defecto. Todo fallo queda en `diagnosticsSlice` con clase, causa y acción sugerida, y es visible en el `DiagnosticsPanel` (con export del informe).

## 1. Campo opcional ausente

- **Ejemplo:** `project.description` no llega en `POST /api/projects` (el campo es opcional).
- **Detección:** Zod (`.optional()`).
- **Tratamiento:** se persiste `null`; el inspector pinta “—” con tooltip “sin descripción”. **Sin error, sin toast, sin diagnóstico.**
- **Regla:** solo se aplica default cuando el *esquema del preset/campo* lo declara (p. ej. `params.filterSpeckle` default 8 en preset `baja`).

## 2. Valor nulo en campo nullable

- **Ejemplo:** `PATCH /api/projects/:id` con `{ "description": null }` = “quitar la descripción” (intencional). Otro: capa leída del servidor con `name: null` (histórico).
- **Detección:** Zod (`.nullable()`) + guards de lectura en el store.
- **Tratamiento:** `description: null` se guarda tal cual (semántica de borrado). `layer.name === null` en datos leídos: la UI deriva “Capa 03” desde `orden` y muestra un **chip informativo** “nombre ausente — derivado”; nunca crash, nunca default silencioso encubierto (el chip lo hace visible).

## 3. Dato inválido

- **Ejemplo:** `PATCH …/layers/l-1` con `{ "colorHex": "#12" }`; o `params.colorPrecision: 99`.
- **Detección:** Zod `.strict()` + invariantes de dominio (`^#[0-9A-Fa-f]{6}$`; rangos por preset).
- **Tratamiento:** 400 RFC 7807 con `errors:[{field, code:"invalid_pattern"}]`; el formulario marca el campo en rojo con mensaje accionable. En datos ya persistidos (lectura), `colorHex` inválido ⇒ color de rescate `rendering.fallbackColorHex` (#FF00FF) + chip de diagnóstico en la capa: el error es **visible**, no camuflado.

## 4. Error temporal

- **Ejemplo:** timeout de red subiendo el ZIP de exportación; worker que tarda más de lo normal.
- **Detección:** `fetch` con timeout/AbortSignal; rechazos transitorios (TypeError de red, 502/503/429 con `Retry-After`).
- **Tratamiento:** reintentos con backoff exponencial (3 intentos, jitter); toast no bloqueante con botón **“Reintentar”**; si persiste, entrada en `DiagnosticsPanel` con el último código/latencia y botón “Exportar informe”. El trabajo del usuario NO se pierde (el estado local permanece).

## 5. Error de autorización

- **Ejemplo:** token de acceso caducado a mitad de sesión; intento de abrir `/api/projects/p-de-otro` (UUID adivinado o viejo).
- **Detección:** 401 (JWT inválido/expirado) y 404 deliberado para recursos ajenos (no 403, para no filtrar existencia — decisión de ADR-007).
- **Tratamiento:** 401 ⇒ intento de refresh transparente y repetición de la petición; si el refresh falla (revocado), cierre de sesión con aviso conservando el borrador local. Mecanismo del borrador (declarado): serialización JSON del estado de trabajo en `localStorage`, **sin PII** (solo propiedades de proyecto/capas/colores); el cifrado en reposo (AES-GCM con WebCrypto, clave derivada por usuario) queda declarado como **endurecimiento de producción pendiente**, no como propiedad ya implementada. 404 en recurso propio existente pero ajeno ⇒ mensaje “el proyecto no existe o no es tuyo”, sin distinguir.

## 6. Error de configuración

- **Ejemplo:** `NEXT_PUBLIC_BG_REMOVAL_MODEL_URL` sin definir al pulsar “Quitar fondo”; `DATABASE_URL` inválida en arranque del API; preset del manifiesto cuyo módulo de esquema no existe (manifiesto y código desalineados).
- **Detección:** chequeos de arranque del engine/adaptador (fallo rápido) + `GET /api/health` con `configDigest`.
- **Tratamiento:** clase CONFIG: **banner bloqueante en la UI con el nombre exacto de la variable/campo y enlace a la documentación de despliegue**. En el arranque del servidor: error fatal con mensaje operativo (no arrancar con configuración rota). Nunca un mensaje genérico “algo salió mal”.

## 7. Fallo crítico

- **Ejemplo:** `AbortError` no controlado, `OutOfMemory` del worker (imagen en el límite + pestañas abiertas), WASM no disponible (navegador sin soporte).
- **Detección:** `worker.onerror`, memoria de `performance.memory` si existe, sondeo de soporte (`typeof WebAssembly`) al inicio.
- **Tratamiento:** modal de diagnóstico con tres acciones: **“Recuperar espacio de trabajo”** (vuelve al último estado persistido vía `GET /api/projects/:id`), “Descargar informe de diagnóstico” (JSON con clase/trace/contexto) y “Reintentar con imagen reducida” (downscale automático propuesto). El historial undo/redo se limpia solo si se descarta el espacio de trabajo (nunca en silencio).

---

## Matriz UI de severidad

| Clase | Canales UI | Bloquea el flujo |
|---|---|---|
| Ausente/nulo | chip informativo | No |
| Dato inválido | inline en campo + toast de acción | Solo la acción inválida |
| Temporal | toast con Reintentar | No (reintento en background) |
| Autorización | toast + redirect conservando borrador | Solo acciones de servidor |
| Configuración | banner con variable exacta | Sí (la función afectada) |
| Crítico | modal + opciones de recuperación | Sí (recuperación explícita) |
