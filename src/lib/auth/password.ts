/**
 * VectorTinta — Password hashing con argon2id (@node-rs/argon2, ADR-007).
 *
 * Parámetros desde server.config (m=19456 KiB, t=2, p=1 — OWASP 2024), NUNCA
 * en código (regla 1 del listón). Verificado que hashSync/verifySync funcionan
 * con el runtime Bun del entorno.
 */
import { hashSync, verifySync } from "@node-rs/argon2";
import { serverConfig } from "@/lib/config/server.config";

const params = serverConfig.argon2;

/** Hash argon2id (algoritmo por defecto de @node-rs/argon2). */
export function hashPassword(password: string): string {
  return hashSync(password, {
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  });
}

/** Verificación en tiempo constante (implementación nativa de argon2). */
export function verifyPassword(passwordHash: string, password: string): boolean {
  try {
    return verifySync(passwordHash, password);
  } catch {
    // Hash corrupto/ilegible: credencial NO válida (nunca "arreglar" en silencio).
    return false;
  }
}
