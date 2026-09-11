/* =========================================================
   POST /api/ai
   ---------------------------------------------------------
   Gemini로 쿠팡 상품명·키워드를 뽑는다.

   API 키는 서버에만 둔다. 브라우저에 내려보내면 누구나 꺼내
   자기 용도로 호출할 수 있고, 요금은 이쪽으로 청구된다.

   호출 비용이 실제로 나가는 엔드포인트라 캡차를 통과해야만
   동작하게 막아둔다.
   ========================================================= */

const { guard } = require("./_turnstile");

const BUILD = "diag-5";
// gemini-2.5-flash는 신규 키로는 더 이상 호출되지 않는다 (404).
const MODEL = "gemini-3.6-flash";
const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const ENDPOINT = `${API_ROOT}/models/${MODEL}:generateContent`;

// 과부하(503)와 속도 제한(429)은 잠시 뒤면 대개 풀린다.
// 방문자에게 "나중에 다시"라고 떠넘기는 대신 서버에서 한 번 더 시도한다.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS = [700, 1800]; // 최대 2회 재시도
const ATTEMPT_TIMEOUT = 9000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(body) {
  let last = { status: 0, text: "" };

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ATTEMPT_TIMEOUT);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (res.ok) return { ok: true, res };

      const text = await res.text();
      last = { status: res.status, text };
      console.warn(`[ai] 시도 ${attempt + 1} 실패: ${res.status}`);

      if (!RETRY_STATUS.has(res.status)) break;
    } catch (err) {
      last = { status: 0, text: err.name === "AbortError" ? "timeout" : String(err.message) };
      console.warn(`[ai] 시도 ${attempt + 1} 예외:`, last.text);
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, ...last };
}

const MAX_LEN = { product: 60, feature: 300, target: 60 };

/* 응답 형식을 스키마로 고정한다.
   자유 문장으로 받으면 파싱이 깨지는 날이 반드시 온다. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    titles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          reason: { type: "string" },
        },
        required: ["title", "reason"],
      },
    },
    keywords: { type: "array", items: { type: "string" } },
    tips: { type: "array", items: { type: "string" } },
  },
  required: ["titles", "keywords", "tips"],
};

const SYSTEM_PROMPT = `당신은 쿠팡에서 3년간 로켓배송과 로켓그로스를 운영한 셀러입니다.
초보 셀러에게 상품명을 다듬어 주는 역할입니다.

상품명 작성 원칙:
- 쿠팡 상품명은 검색 노출이 전부입니다. 구매자가 실제로 검색창에 칠 단어를 앞쪽에 둡니다.
- 브랜드명 + 핵심키워드 + 규격/수량 + 특징 순서가 기본입니다.
- 50자 안팎이 적당합니다. 너무 길면 잘려서 보입니다.
- 의미 없는 수식어(최고, 대박, 강추)는 넣지 않습니다.
- 과장 표현이나 검증 불가한 효능은 쓰지 않습니다. 제재 대상입니다.

출력 규칙:
- titles: 서로 다른 전략의 상품명 5개. reason에는 그 상품명을 그렇게 쓴 이유를 한 문장으로.
- keywords: 함께 노려볼 만한 연관 검색어 8개.
- tips: 이 상품 카테고리에서 주의할 점 3개. 일반론 말고 구체적으로.
- 모든 내용은 한국어로 씁니다.`;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST만 허용합니다." });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("[ai] GEMINI_API_KEY 없음");
    return res.status(500).json({ error: "서버 설정이 완료되지 않았습니다." });
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // 배포된 함수가 어느 버전인지 확인용. 비밀값은 담지 않는다. 진단 끝나면 제거.
  if (payload.probe === true) {
    if (payload.models !== true) {
      return res.status(200).json({ build: BUILD, model: MODEL });
    }
    // 이 키로 쓸 수 있는 모델을 확인한다. 대체 모델을 고르기 위한 진단.
    try {
      const list = await fetch(`${API_ROOT}/models?pageSize=100`, {
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
      });
      const body = await list.json();
      const names = (body.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      return res.status(200).json({ build: BUILD, model: MODEL, available: names });
    } catch (err) {
      return res.status(200).json({ build: BUILD, model: MODEL, listError: String(err.message) });
    }
  }

  /* 캡차 ------------------------------------------------------------- */
  const blocked = await guard(req, payload.turnstileToken);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  /* 입력값 ----------------------------------------------------------- */
  const product = String(payload.product ?? "").trim();
  const feature = String(payload.feature ?? "").trim();
  const target = String(payload.target ?? "").trim();

  if (!product) return res.status(400).json({ error: "상품이 무엇인지 입력해 주세요." });
  if (product.length > MAX_LEN.product) return res.status(400).json({ error: "상품명이 너무 깁니다." });
  if (feature.length > MAX_LEN.feature) return res.status(400).json({ error: "특징이 너무 깁니다." });
  if (target.length > MAX_LEN.target) return res.status(400).json({ error: "타겟이 너무 깁니다." });

  const userPrompt = [
    `상품: ${product}`,
    feature ? `특징: ${feature}` : null,
    target ? `타겟 고객: ${target}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const call = await callGemini({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.9,
        // Gemini 3 계열은 추론 토큰도 이 예산에서 차감한다.
        // 2048로는 추론만 하다 끝나 본문이 비어 오는 일이 생긴다.
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    if (!call.ok) {
      console.error("[ai] gemini 최종 실패", call.status, call.text.slice(0, 500));

      const msg =
        call.status === 503 || call.status === 0
          ? "AI 서버가 혼잡합니다. 30초쯤 뒤에 다시 눌러주세요."
          : call.status === 429
          ? "오늘 사용량을 모두 썼습니다. 내일 다시 이용해 주세요."
          : "생성에 실패했습니다. 잠시 후 다시 시도해 주세요.";

      // 진단용. Google의 error.message에는 키가 포함되지 않는다
      // (키는 헤더로만 보내고 응답에 echo되지 않는다). 확인 후 제거할 것.
      let reason = "";
      try {
        reason = JSON.parse(call.text)?.error?.message || "";
      } catch {
        reason = call.text.slice(0, 200);
      }

      return res.status(502).json({
        error: msg,
        debug: `gemini ${call.status}: ${reason}`.slice(0, 300),
      });
    }

    const data = await call.res.json();
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Gemini 3 계열은 추론 결과를 thought 파트로 함께 보낸다.
    // parts[0]만 읽으면 엉뚱한 조각을 잡으므로, 실제 답변 파트만 모아 잇는다.
    const text = parts
      .filter((p) => typeof p.text === "string" && p.thought !== true)
      .map((p) => p.text)
      .join("")
      .trim();

    if (!text) {
      // 안전 필터에 걸리거나, 추론이 출력 예산을 다 쓰면 여기로 온다
      console.error("[ai] 빈 응답:", JSON.stringify(data).slice(0, 600));
      return res.status(502).json({
        error: "결과를 만들지 못했습니다. 입력을 조금 바꿔서 다시 시도해 주세요.",
        debug: `empty text · finishReason=${candidate?.finishReason} · parts=${parts.length}`,
      });
    }

    // responseSchema를 줘도 코드펜스를 붙여 오는 경우가 있다
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // 앞뒤에 설명이 붙은 경우 첫 JSON 덩어리만 떼어 본다
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end <= start) {
        console.error("[ai] JSON 아님:", cleaned.slice(0, 400));
        return res.status(502).json({
          error: "결과를 해석하지 못했습니다. 다시 시도해 주세요.",
          debug: `parse failed · finishReason=${candidate?.finishReason} · head=${cleaned.slice(0, 120)}`,
        });
      }
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("[ai]", err);
    return res.status(500).json({
      error: "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      debug: `${err.name}: ${String(err.message).slice(0, 180)}`,
    });
  }
};
