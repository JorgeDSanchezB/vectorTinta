/**
 * VectorTinta — Lectura de variables de entorno PÚBLICAS en código cliente.
 *
 * Las variables NEXT_PUBLIC_* de Next.js se inlinean en el bundle del
 * navegador SOLO cuando se accede a `process.env.NEXT_PUBLIC_…` como
 * expresión literal; este helper cubre la lectura dinámica por nombre (la que
 * necesita el motor u2net-onnx, cuyo nombre de variable vive en configuración:
 * `appConfig.bgRemoval.modelUrlEnvName`). En el navegador `process` no existe
 * y devuelve `undefined` sin lanzar; en Node/Bun (scripts de verificación,
 * server) devuelve el valor real.
 *
 * Nota honesta: en un bundle de cliente puro la lectura dinámica devolverá
 * `undefined` aunque la variable esté definida en el entorno de build. Para
 * el motor u2net-onnx esto es irrelevante hoy: ambos caminos (sin URL o con
 * URL) terminan en un problema 'configuracion' porque la inferencia no está
 * incluida en esta iteración.
 */

/** Valor de una variable de entorno pública; `undefined` si no es accesible. */
export function readPublicEnv(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const valor = g.process?.env?.[name];
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}
