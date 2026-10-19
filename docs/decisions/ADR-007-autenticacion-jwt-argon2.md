# ADR-007 — Autenticación: JWT acceso+refresco rotatorio con jose y argon2

**Estado:** Aceptada · Problema / coste / alternativa descartada.

## Contexto (problema)

El contrato del enunciado exige JWT de acceso + refresh y **argon2** para hashing. El entorno ofrece NextAuth v4. En NextAuth v4, el flujo de *credentials* con estrategia JWT no ofrece rotación de refresh tokens de primera clase (el token de sesión se renueva opaco al desarrollador), y el hashing por defecto es bcrypt.

## Decisión

- **JWT con `jose`**: access token TTL 15 min (config `server.config.ts`), claims mínimos (`sub`, `plan`, `iat`, `exp`, `jti`).
- **Refresh token rotatorio**: opaco de alta entropía, guardado **hasheado (sha-256)** en la tabla `RefreshToken` con `expiresAt`/`revokedAt`; cada uso lo rota y revoca el anterior. Cookie `httpOnly; SameSite=Lax; Path=/api/auth` o body (para clientes sin cookies). Logout = revocación.
- **argon2id** con parámetros OWASP (memoria 19 MiB, t=2, p=1) — valores en `server.config.ts`, no en código.
- Guard de autorización central (`auth/guards.ts`): `requireUser()` + `requireOwnedProject(id)`; recursos ajenos → 404 (no filtrar existencia).

## Consecuencias (coste)

- Mantenemos nosotros la superficie de seguridad (rotación, revocación, CWE de tokens) en lugar de delegarla a un framework. Mitigado con tests de seguridad obligatorios en Fase 6 (cuando exista código).
- Tabla extra (`RefreshToken`) frente a "sesión eterna" — coste asumido por el requisito de revocación real.

## Alternativas descartadas

- **NextAuth v4:** su flujo credentials+JWT no expone rotación de refresh de primera clase; añadirlo es pelear contra el framework. Sí se reevaluará si se necesita SSO social (OAuth) en v2.
- **Sesiones de servidor con cookie:** válido, pero el enunciado pide JWT explícitamente y el cliente (workers/preview) consume Bearer con naturalidad.
- **bcrypt:** descartado por exigencia explícita de argon2 (mejor resistencia GPU).
