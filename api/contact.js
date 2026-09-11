/* =========================================================
   POST /api/contact
   ---------------------------------------------------------
   문의 접수의 유일한 입구.

   1. Cloudflare Turnstile 토큰을 검증한다 (봇 차단)
   2. 입력값을 서버에서 다시 검증한다 (브라우저 검증은 신뢰하지 않는다)
   3. 첨부가 있으면 Storage 업로드용 서명 URL을 발급한다
   4. contacts 테이블에 행을 넣는다

   service_role 키는 RLS를 우회하므로 절대 브라우저로 나가면 안 된다.
   Vercel 환경변수로만 주입받는다.
   ========================================================= */

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const ALLOWED_TYPE_VALUES = ["강의", "소싱", "제휴", "기타"];
const BUCKET = "contact-uploads";

/* Turnstile 검증 ------------------------------------------------------ */
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

/* 입력 검증 ----------------------------------------------------------- */
function validate(payload) {
  const name = String(payload.name ?? "").trim();
  const contact = String(payload.contact ?? "").trim();
  const type = String(payload.type ?? "").trim();
  const message = String(payload.message ?? "").trim();

  if (name.length < 1 || name.length > 40) return { error: "이름을 확인해 주세요." };
  if (contact.length < 1 || contact.length > 120) return { error: "연락처를 확인해 주세요." };
  if (message.length < 5 || message.length > 1000) return { error: "문의 내용을 확인해 주세요." };
  if (!ALLOWED_TYPE_VALUES.includes(type)) return { error: "문의 유형을 확인해 주세요." };

  const files = Array.isArray(payload.files) ? payload.files : [];
  if (files.length > MAX_FILES) return { error: `이미지는 최대 ${MAX_FILES}장까지 첨부할 수 있습니다.` };

  for (const f of files) {
    if (!ALLOWED_TYPES[f?.type]) return { error: "이미지 파일만 첨부할 수 있습니다." };
    if (!Number.isFinite(f?.size) || f.size <= 0 || f.size > MAX_FILE_BYTES) {
      return { error: "이미지는 장당 5MB까지 첨부할 수 있습니다." };
    }
  }

  return { data: { name, contact, type, message }, files };
}

/* Storage 서명 업로드 URL --------------------------------------------- */
async function createSignedUpload(supabaseUrl, serviceKey, path) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) throw new Error(`sign ${res.status} ${await res.text()}`);

  // { url: "/object/upload/sign/<bucket>/<path>?token=..." }
  const { url } = await res.json();
  return `${supabaseUrl}/storage/v1${url}`;
}

/* 핸들러 -------------------------------------------------------------- */
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST만 허용합니다." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey || !process.env.TURNSTILE_SECRET_KEY) {
    console.error("[contact] 환경변수 누락");
    return res.status(500).json({ error: "서버 설정이 완료되지 않았습니다." });
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  /* 1. 캡차 ---------------------------------------------------------- */
  const token = payload.turnstileToken;
  if (!token) return res.status(400).json({ error: "자동 입력 방지 확인이 필요합니다." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const captcha = await verifyTurnstile(token, ip);
  if (!captcha.ok) {
    console.warn("[contact] turnstile 실패:", captcha.reason);
    return res.status(403).json({ error: "자동 입력 방지 확인에 실패했습니다. 다시 시도해 주세요." });
  }

  /* 2. 입력값 -------------------------------------------------------- */
  const { data, files, error } = validate(payload);
  if (error) return res.status(400).json({ error });

  try {
    /* 3. 첨부 서명 URL ----------------------------------------------- */
    // 파일명은 방문자가 보낸 이름을 쓰지 않는다. 경로 조작을 원천 차단한다.
    const uploads = [];
    for (const f of files) {
      const path = `inbox/${crypto.randomUUID()}.${ALLOWED_TYPES[f.type]}`;
      uploads.push({ path, url: await createSignedUpload(supabaseUrl, serviceKey, path) });
    }

    /* 4. 저장 --------------------------------------------------------- */
    // 행을 먼저 넣는다. 뒤이은 업로드가 실패하면 첨부 없는 문의로 남지만,
    // 문의 내용과 연락처는 확보되므로 잃는 것이 적다.
    const insert = await fetch(`${supabaseUrl}/rest/v1/contacts`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ ...data, image_paths: uploads.map((u) => u.path) }),
    });

    if (!insert.ok) throw new Error(`insert ${insert.status} ${await insert.text()}`);

    return res.status(200).json({ ok: true, uploads });
  } catch (err) {
    console.error("[contact]", err);
    return res.status(500).json({ error: "접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요." });
  }
};
