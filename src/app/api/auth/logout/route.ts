/**
 * VectorTinta — POST /api/auth/logout (ADR-007).
 *
 * Requiere Bearer (auth). Revoca el refresh presentado (cookie o body) y
 * BORRA la cookie. Idempotente: sin token o ya revocado también responde 204
 * (logout no filtra estado de sesión). Rate bucket mutations (por usuario).
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api-handler";
import { clearRefreshCookie, revokeRefreshToken } from "@/lib/auth/guards";
import { parseRefreshBody } from "@/lib/http/validate";
import { writeAudit } from "@/lib/audit";

export const POST = withApi({ auth: true, rate: "mutations" }, async (req, ctx) => {
  const bodyToken = await parseRefreshBody(req);
  await revokeRefreshToken(req, bodyToken);
  await writeAudit({ userId: ctx.userId, action: "auth.logout", metadata: {} });

  // 204 sin cuerpo + cookie caducada en el cliente.
  return clearRefreshCookie(new NextResponse(null, { status: 204 }));
});
