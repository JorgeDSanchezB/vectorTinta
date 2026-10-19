/**
 * VectorTinta — POST /api/auth/refresh (plan §3.2, ADR-007 rotación obligatoria).
 *
 * Acepta el refresh token por cookie httpOnly (vía principal) o por body
 * `{ "refreshToken": "…" }` (vía alternativa documentada). Rotación en cada uso:
 * el token presentado queda REVOCADO y se emite uno nuevo + access token.
 * Reutilizar un token ya usado → 401 (detección de robo, plan §2.2).
 */
import { withApi } from "@/lib/http/api-handler";
import { rotateRefreshToken } from "@/lib/auth/guards";
import { parseRefreshBody } from "@/lib/http/validate";
import { writeAudit } from "@/lib/audit";

export const POST = withApi({ rate: "auth" }, async (req) => {
  const bodyToken = await parseRefreshBody(req);
  const { response, userId } = await rotateRefreshToken(req, bodyToken);
  await writeAudit({ userId, action: "auth.refresh", metadata: {} });
  return response;
});
