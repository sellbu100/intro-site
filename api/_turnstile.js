/* =========================================================
   Cloudflare Turnstile 검증
   ---------------------------------------------------------
   api/ 안에서 밑줄(_)로 시작하는 파일은 라우트가 되지 않는다.
   contact.js와 ai.js가 함께 쓴다.
   ========================================================= */

async function verifyTurnstile(token, ip) {
  const body = new URLSearchParams();
  body.append("secret", process.env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  if (!res.ok) return { ok: false, reason: `siteverify ${res.status}` };

  const data = await res.json();
  return { ok: data.success === true, reason: (data["error-codes"] || []).join(",") };
}

/* 요청에서 토큰을 꺼내 검증까지 한 번에 처리한다.
   통과하면 null, 막아야 하면 { status, error }를 돌려준다. */
async function guard(req, token) {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    console.error("[turnstile] TURNSTILE_SECRET_KEY 없음");
    return { status: 500, error: "서버 설정이 완료되지 않았습니다." };
  }
  if (!token) {
    return { status: 400, error: "자동 입력 방지 확인이 필요합니다." };
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const result = await verifyTurnstile(token, ip);

  if (!result.ok) {
    console.warn("[turnstile] 실패:", result.reason);
    return { status: 403, error: "자동 입력 방지 확인에 실패했습니다. 다시 시도해 주세요." };
  }

  return null;
}

module.exports = { verifyTurnstile, guard };
