# ADR-011 — Acceso de taller invitado (cuenta desechable para evaluación)

**Estado:** aceptado · **Fecha:** Iteración 2 (Fase 6) · **Contexto:** sandbox de evaluación / demo del producto

## Problema

El catálogo de la Fase 3 solo contempla `register` y `login`. En un entorno de
evaluación (taller que abre el estudio por primera vez), obligar a inventar un
email y una contraseña antes de ver una sola pantalla del producto fricciona
contra el objetivo de producto: «pasar de un JPG del cliente a los fotolitos
sin abrir Illustrator ni instalar nada».

## Coste de la decisión

- **Coste aceptado:** un endpoint adicional (`POST /api/auth/guest`) que crea
  un usuario `taller-inv-{6hex}@guest.vectortinta.local` con contraseña
  aleatoria interna (nunca revelada), plan gratuito y cuotas normales.
  Auditado como `auth.guest`. Ningún dato personal se pide ni se guarda.
- **Complejidad añadida:** despreciable (una ruta más con el mismo guard de
  rate limiting `auth`).
- **Alternativa descartada:** rellenar el formulario de registro con datos
  sintéticos desde la UI — engañoso (validaciones saltan, tokens de email
  falsos en pantalla) y acopla el producto al entorno de demo.

## Consecuencias

- La cuenta invitada es COMPLETA y persistente (cookie de refresh como
  cualquiera): el taller invitado puede guardar, recargar y exportar. Es una
  cuenta desechable por política de dominio, no por técnica.
- El botón es explícito («Entrar como taller invitado») y el pie de la
  pantalla de acceso declara la cuota de proyectos del plan gratuito
  (configuración, no hardcode).
- Producción: mantener o retirar es un cambio de UNA línea en la UI (el
  endpoint queda). Se documenta aquí para el árbitro: esta es una adición al
  catálogo §3.2, no una desviación silenciosa.
