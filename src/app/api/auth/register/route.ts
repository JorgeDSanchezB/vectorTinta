/**
 * VectorTinta — POST /api/auth/register (plan §3.2/§3.3).
 *
 * Rate: bucket auth (10/min/IP). 201 AuthResponseDto + cookie httpOnly de
 * refresh. Errores canónicos: 400 por campo (password corta → too_small con
 * minLength de server.config) · 409 conflicto si el email ya existe.
 */
import { withApi } from "@/lib/http/api-handler";
import { throwProblem } from "@/lib/http/problem";
import { parseStrictBody } from "@/lib/http/validate";
import { RegisterRequestSchema } from "@/lib/domain/requests";
import { serverConfig } from "@/lib/config/server.config";
import { AUTH_USER_SELECT, issueAuthResponse } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

export const POST = withApi({ rate: "auth" }, async (req) => {
  const body = await parseStrictBody(req, RegisterRequestSchema);

  // Política de contraseñas: SOLO el servidor la conoce (server.config, §9).
  if (body.password.length < serverConfig.passwordMinLength) {
    throwProblem("validacion", {
      title: "Cuerpo inválido",
      detail: "La contraseña no cumple la política del taller.",
      instance: "/api/auth/register",
      errors: [
        { field: "password", code: "too_small", minLength: serverConfig.passwordMinLength },
      ],
    });
  }

  // Email único (chequeo explícito + P2002 como segunda barrera de carrera).
  const existing = await db.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing !== null) {
    throwProblem("conflicto", {
      title: "Email ya registrado",
      detail: "Ya existe una cuenta con este email.",
      instance: "/api/auth/register",
      errors: [{ field: "email", code: "already_exists" }],
    });
  }

  const user = await db.user.create({
    data: {
      email: body.email,
      name: body.name ?? null,
      passwordHash: hashPassword(body.password),
      plan: "free",
    },
    select: AUTH_USER_SELECT,
  });

  await writeAudit({
    userId: user.id,
    action: "auth.register",
    metadata: { plan: "free" }, // sin PII: el email NUNCA entra en metadata.
  });

  return issueAuthResponse(user, 201);
});
