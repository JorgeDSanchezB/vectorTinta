/**
 * VectorTinta — POST /api/auth/login (plan §3.2/§3.3).
 *
 * Rate: bucket auth. 200 AuthResponseDto + cookie de refresh. Credenciales
 * incorrectas → 401 con detail GENÉRICO (no se filtra si falló el email o la
 * contraseña). Igualación de tiempos con un hash señuelo cuando el usuario no
 * existe (el atacante no distingue "no existe" por latencia).
 */
import { withApi } from "@/lib/http/api-handler";
import { parseStrictBody } from "@/lib/http/validate";
import { LoginRequestSchema } from "@/lib/domain/requests";
import { AUTH_USER_SELECT, issueAuthResponse } from "@/lib/auth/guards";
import { ApiProblem, makeProblem } from "@/lib/domain/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

/** Hash señuelo: verificación siempre presente (igualación de tiempos). */
const DECOY_HASH = hashPassword("taller-senal-igualacion-de-tiempos");

export const POST = withApi({ rate: "auth" }, async (req) => {
  const body = await parseStrictBody(req, LoginRequestSchema);

  const user = await db.user.findUnique({
    where: { email: body.email },
    select: { ...AUTH_USER_SELECT, passwordHash: true },
  });

  const passwordOk =
    user !== null
      ? verifyPassword(user.passwordHash, body.password)
      : verifyPassword(DECOY_HASH, body.password); // usuario inexistente: mismo coste.

  if (user === null || !passwordOk) {
    // 401 con detail GENÉRICO: no se filtra si falló el email o la contraseña.
    throw new ApiProblem(
      makeProblem("no-autenticado", {
        title: "No autenticado",
        detail: "Credenciales no válidas.",
      }),
    );
  }

  const { passwordHash: _omit, ...safeUser } = user;
  void _omit;

  await writeAudit({ userId: user.id, action: "auth.login", metadata: {} });

  return issueAuthResponse(safeUser, 200);
});
