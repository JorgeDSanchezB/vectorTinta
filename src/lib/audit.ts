/**
 * VectorTinta — Auditoría append-only (plan §2.2 AuditEvent).
 *
 * `writeAudit` registra QUÉ pasó y a QUÉ recursos (ids), nunca datos
 * personales: `metadata` solo lleva ids/contadores/formatos (el guard anti-PII
 * del plan §4.2 aplicaría también aquí; por construcción nunca se envían
 * emails/nombres/teléfonos). La auditoría es best-effort: un fallo de log NO
 * rompe la operación de negocio (se registra en consola para diagnóstico).
 *
 * Borrado: AuditEvent.user → SetNull (se conserva el evento al borrar usuario);
 * AuditEvent.project → Cascade (un proyecto es una unidad de privacidad).
 */
import { db } from "@/lib/db";

/** Acciones tipadas del dominio (unión literal; el borde no admite otras). */
export type AuditAction =
  | "auth.register"
  | "auth.login"
  | "auth.guest"
  | "auth.refresh"
  | "auth.logout"
  | "project.create"
  | "project.patch"
  | "project.delete"
  | "asset.upload"
  | "vectorization.persist"
  | "layer.patch"
  | "layer.create"
  | "export.register";

export interface AuditInput {
  userId?: string;
  projectId?: string;
  action: AuditAction;
  /** Solo ids/contadores/formatos. Sin PII (ver cabecera del módulo). */
  metadata: Record<string, string | number | boolean>;
}

/** Inserta un AuditEvent (append-only). Falla silenciosa con console.error. */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
        action: input.action,
        metadata: input.metadata,
      },
      select: { id: true }, // SELECT explícito también en escrituras.
    });
  } catch (error) {
    console.error("[audit] no se pudo registrar el evento:", input.action, error);
  }
}
