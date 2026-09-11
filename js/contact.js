/* =========================================================
   문의 폼 — Supabase REST API로 직접 전송
   SDK 없이 fetch만 사용해서 번들·빌드 단계가 필요 없다.
   ========================================================= */
const form = document.getElementById("contact-form");

if (form) {
  const statusEl = document.getElementById("form-status");
  const submitEl = document.getElementById("f-submit");
  const messageEl = document.getElementById("f-message");
  const countEl = document.getElementById("f-count");
  const agreeEl = document.getElementById("f-agree");

  const cfg = window.SUPABASE_CONFIG || {};
  const isConfigured = Boolean(cfg.url && cfg.anonKey);

  /* 글자 수 표시 ------------------------------------------------------ */
  const updateCount = () => (countEl.textContent = messageEl.value.length);
  messageEl.addEventListener("input", updateCount);
  updateCount();

  /* 상태 메시지 ------------------------------------------------------- */
  const setStatus = (text, kind) => {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-ok", kind === "ok");
    statusEl.classList.toggle("is-bad", kind === "bad");
  };

  /* 필드 오류 표시 ---------------------------------------------------- */
  const clearErrors = () => {
    form.querySelectorAll(".is-error").forEach((el) => el.classList.remove("is-error"));
    form.querySelectorAll(".field__error").forEach((el) => el.remove());
  };

  const markError = (input, message) => {
    const box = input.closest(".field") || input.closest(".check");
    if (!box) return;
    box.classList.add("is-error");
    if (box.querySelector(".field__error")) return;
    const p = document.createElement("span");
    p.className = "field__error";
    p.textContent = message;
    box.appendChild(p);
  };

  /* 검증 -------------------------------------------------------------- */
  // 이메일이거나, 숫자 9자리 이상이면 전화번호로 본다
  const looksLikeContact = (value) => {
    const digits = value.replace(/\D/g, "");
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    return isEmail || digits.length >= 9;
  };

  const validate = (data) => {
    const errors = [];
    if (!data.name) errors.push(["f-name", "이름을 입력해 주세요."]);
    if (!data.contact) {
      errors.push(["f-contact", "연락처 또는 이메일을 입력해 주세요."]);
    } else if (!looksLikeContact(data.contact)) {
      errors.push(["f-contact", "연락처 형식을 확인해 주세요."]);
    }
    if (!data.message) {
      errors.push(["f-message", "문의 내용을 입력해 주세요."]);
    } else if (data.message.length < 5) {
      errors.push(["f-message", "조금 더 자세히 적어주세요. (5자 이상)"]);
    }
    if (!agreeEl.checked) errors.push(["f-agree", "개인정보 수집·이용에 동의해 주세요."]);
    return errors;
  };

  /* 전송 -------------------------------------------------------------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setStatus("", null);

    const data = {
      name: document.getElementById("f-name").value.trim(),
      contact: document.getElementById("f-contact").value.trim(),
      type: document.getElementById("f-type").value,
      message: messageEl.value.trim(),
    };

    // 봇이 채운 숨은 필드 — 조용히 성공한 척하고 버린다
    if (document.getElementById("f-company").value) {
      setStatus("문의가 접수되었습니다.", "ok");
      form.reset();
      return;
    }

    const errors = validate(data);
    if (errors.length) {
      errors.forEach(([id, msg]) => markError(document.getElementById(id), msg));
      document.getElementById(errors[0][0]).focus();
      setStatus("입력하지 않은 항목이 있습니다.", "bad");
      return;
    }

    if (!isConfigured) {
      setStatus("문의 접수 준비 중입니다. 잠시 후 다시 시도해 주세요.", "bad");
      console.warn("[contact] Supabase가 설정되지 않았습니다. js/config.js를 확인하세요.");
      return;
    }

    submitEl.disabled = true;
    submitEl.textContent = "보내는 중...";

    try {
      const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`${res.status} ${detail}`);
      }

      form.reset();
      updateCount();
      setStatus("문의가 접수되었습니다. 확인 후 회신드리겠습니다.", "ok");
    } catch (err) {
      console.error("[contact]", err);
      setStatus("전송에 실패했습니다. 잠시 후 다시 시도해 주세요.", "bad");
    } finally {
      submitEl.disabled = false;
      submitEl.textContent = "문의 보내기";
    }
  });

  /* 입력을 고치기 시작하면 해당 오류를 지운다 -------------------------- */
  form.addEventListener("input", (e) => {
    const box = e.target.closest(".field") || e.target.closest(".check");
    if (!box || !box.classList.contains("is-error")) return;
    box.classList.remove("is-error");
    const msg = box.querySelector(".field__error");
    if (msg) msg.remove();
  });
}
