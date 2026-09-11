/* =========================================================
   AI 상품명 생성기
   ---------------------------------------------------------
   /api/ai 로 보내고 결과를 그린다.
   Gemini 호출은 서버에서만 일어난다.
   ========================================================= */
const aiForm = document.getElementById("ai-form");

if (aiForm) {
  const statusEl = document.getElementById("ai-status");
  const submitEl = document.getElementById("a-submit");
  const productEl = document.getElementById("a-product");
  const featureEl = document.getElementById("a-feature");
  const targetEl = document.getElementById("a-target");
  const countEl = document.getElementById("a-count");

  const emptyEl = document.getElementById("ai-empty");
  const resultEl = document.getElementById("ai-result");
  const titlesEl = document.getElementById("r-titles");
  const keywordsEl = document.getElementById("r-keywords");
  const tipsEl = document.getElementById("r-tips");

  const endpoint = "/api/ai";

  /* 글자 수 ----------------------------------------------------------- */
  const updateCount = () => (countEl.textContent = featureEl.value.length);
  featureEl.addEventListener("input", updateCount);
  updateCount();

  /* 상태 메시지 ------------------------------------------------------- */
  const setStatus = (text, kind) => {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-ok", kind === "ok");
    statusEl.classList.toggle("is-bad", kind === "bad");
  };

  const clearError = () => {
    const box = productEl.closest(".field");
    box.classList.remove("is-error");
    box.querySelector(".field__error")?.remove();
  };

  /* 결과 그리기 ------------------------------------------------------- */
  // textContent만 쓴다. 모델이 돌려준 문자열을 innerHTML로 넣으면
  // 그대로 스크립트 실행 통로가 된다.
  const render = (data) => {
    titlesEl.innerHTML = "";
    keywordsEl.innerHTML = "";
    tipsEl.innerHTML = "";

    (data.titles || []).forEach((item) => {
      const li = document.createElement("li");

      const row = document.createElement("div");
      row.className = "titles__row";

      const text = document.createElement("span");
      text.className = "titles__text";
      text.textContent = item.title;

      const len = document.createElement("span");
      len.className = "titles__len";
      len.textContent = `${item.title.length}자`;

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "titles__copy";
      copy.textContent = "복사";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(item.title);
          copy.textContent = "복사됨";
          setTimeout(() => (copy.textContent = "복사"), 1400);
        } catch {
          copy.textContent = "실패";
          setTimeout(() => (copy.textContent = "복사"), 1400);
        }
      });

      const reason = document.createElement("p");
      reason.className = "titles__reason";
      reason.textContent = item.reason;

      row.append(text, len, copy);
      li.append(row, reason);
      titlesEl.appendChild(li);
    });

    (data.keywords || []).forEach((kw) => {
      const li = document.createElement("li");
      li.textContent = kw;
      keywordsEl.appendChild(li);
    });

    (data.tips || []).forEach((tip) => {
      const li = document.createElement("li");
      li.textContent = tip;
      tipsEl.appendChild(li);
    });

    emptyEl.hidden = true;
    resultEl.hidden = false;
  };

  /* 전송 -------------------------------------------------------------- */
  aiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    setStatus("", null);

    const product = productEl.value.trim();
    if (!product) {
      const box = productEl.closest(".field");
      box.classList.add("is-error");
      const msg = document.createElement("span");
      msg.className = "field__error";
      msg.textContent = "어떤 상품인지 입력해 주세요.";
      box.appendChild(msg);
      productEl.focus();
      return;
    }

    const turnstileToken = window.TurnstileWidget.getToken();
    if (!turnstileToken) {
      setStatus("자동 입력 방지 확인이 끝나지 않았습니다. 잠시 후 다시 눌러주세요.", "bad");
      return;
    }

    submitEl.disabled = true;
    submitEl.textContent = "만드는 중...";
    setStatus("AI가 상품명을 고르고 있습니다. 5초쯤 걸립니다.", null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          feature: featureEl.value.trim(),
          target: targetEl.value.trim(),
          turnstileToken,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.debug) console.error("[ai] 상세:", data.debug);
        throw new Error(data.debug ? `${data.error} (${data.debug})` : data.error || `요청 실패 (${res.status})`);
      }

      render(data);
      setStatus("완성됐습니다. 마음에 드는 상품명을 복사해서 쓰세요.", "ok");
    } catch (err) {
      console.error("[ai]", err);
      setStatus(err.message || "생성에 실패했습니다. 잠시 후 다시 시도해 주세요.", "bad");
    } finally {
      window.TurnstileWidget.reset();
      submitEl.disabled = false;
      submitEl.textContent = "상품명 만들기";
    }
  });

  productEl.addEventListener("input", clearError);
}
