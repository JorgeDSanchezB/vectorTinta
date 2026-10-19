/**
 * VectorTinta — POST /api/auth/guest (ADR-011: modo taller invitado).
 *
 * Crea una cuenta desechable SIN credenciales utilizables: email interno
 * `taller-inv-{6 hex}@guest.vectortinta.local`, name "Taller invitado" y una
 * contraseña aleatoria interna de 32 bytes que jamás sale del servidor (el
 * acceso se mantiene por access token + cookie de refresh, igual que el resto).
 * 201 AuthResponseDto. El email interno NO es PII (dominio del producto).
 */
import { randomBytes } from "node:crypto";
import { withApi } from "@/lib/http/api-handler";
import { AUTH_USER_SELECT, issueAuthResponse } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

const GUEST_DOMAIN = "guest.vectortinta.local";

export const POST = withApi({ rate: "auth" }, async () => {
  const suffix = randomBytes(3).toString("hex"); // 6 caracteres hex.
  const email = `taller-inv-${suffix}@${GUEST_DOMAIN}`;

  const user = await db.user.create({
    data: {
      email,
      name: "Taller invitado",
      // Contraseña interna aleatoria: no se devuelve ni se usa para entrar.
      passwordHash: hashPassword(randomBytes(32).toString("base64url")),
      plan: "free",
    },
    select: AUTH_USER_SELECT,
  });

  await writeAudit({ userId: user.id, action: "auth.guest", metadata: { plan: "free" } });

  return issueAuthResponse(user, 201);
});
