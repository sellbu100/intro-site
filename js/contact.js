/* =========================================================
   문의 폼
   ---------------------------------------------------------
   흐름:
     1) Turnstile 토큰 확보
     2) /api/contact 로 입력값 + 토큰 전송
     3) 서버가 검증 후 행을 만들고 업로드용 서명 URL을 돌려준다
     4) 이미지를 그 URL로 직접 올린다

   이미지는 서버를 거치지 않고 Storage로 바로 간다.
   서버 함수의 요청 본문 한도(4.5MB)를 넘기지 않기 위해서다.
   ========================================================= */
const form = document.getElementById("contact-form");

/* Turnstile은 스크립트 로드 시점이 제각각이라 전역 콜백으로 받는다 */
let turnstileWidgetId = null;
let turnstileReady = false;

const renderTurnstile = () => {
  if (turnstileReady) return;

  // 위젯을 담는 div의 id는 "turnstile"이면 안 된다.
  // id가 있는 요소는 같은 이름의 전역으로 노출되어 window.turnstile
  // (Cloudflare API)을 가려버린다. 그래서 turnstile-box를 쓴다.
  const host = document.getElementById("turnstile-box");
  const siteKey = window.SITE_CONFIG?.turnstile?.siteKey;
  if (!host || !siteKey || typeof window.turnstile?.render !== "function") return;

  try {
    turnstileWidgetId = window.turnstile.render(host, {
      sitekey: siteKey,
      theme: "light",
      language: "ko",
    });
    turnstileReady = turnstileWidgetId !== undefined;
  } catch (err) {
    console.error("[turnstile] 위젯을 그리지 못했습니다:", err);
  }
};

window.onTurnstileReady = renderTurnstile;

// api.js가 contact.js보다 먼저 실행되면 위 콜백을 놓친다.
// 이미 로드돼 있으면 직접 그리고, 아니면 DOM 준비 시점에 한 번 더 시도한다.
renderTurnstile();
document.addEventListener("DOMContentLoaded", renderTurnstile);

if (form) {
  const statusEl = document.getElementById("form-status");
  const submitEl = document.getElementById("f-submit");
  const messageEl = document.getElementById("f-message");
  const countEl = document.getElementById("f-count");
  const agreeEl = document.getElementById("f-agree");

  const uploadEl = document.getElementById("upload");
  const filesEl = document.getElementById("f-files");
  const previewEl = document.getElementById("preview");
  const progressEl = document.getElementById("upload-progress");
  const progressBar = progressEl.querySelector("i");

  const cfg = window.SITE_CONFIG || {};
  const up = cfg.upload || {};
  const MAX_FILES = up.maxFiles || 3;
  const MAX_BYTES = up.maxFileBytes || 5 * 1024 * 1024;
  const ALLOWED = up.allowedTypes || ["image/jpeg", "image/png", "image/webp", "image/gif"];

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

  /* =========================================================
     이미지 첨부
     ========================================================= */
  // 선택한 파일을 직접 들고 있는다. input.files는 개별 삭제가 안 되기 때문.
  let picked = [];

  const prettySize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const renderPreview = () => {
    // 이전 미리보기의 objectURL을 해제해 메모리 누수를 막는다
    previewEl.querySelectorAll("img").forEach((img) => URL.revokeObjectURL(img.src));
    previewEl.innerHTML = "";

    picked.forEach((file, i) => {
      const li = document.createElement("li");

      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = "";

      const name = document.createElement("span");
      name.className = "preview__name";
      name.textContent = `${file.name} · ${prettySize(file.size)}`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preview__remove";
      btn.textContent = "×";
      btn.setAttribute("aria-label", `${file.name} 삭제`);
      btn.addEventListener("click", () => {
        picked.splice(i, 1);
        renderPreview();
      });

      li.append(img, name, btn);
      previewEl.appendChild(li);
    });

    const full = picked.length >= MAX_FILES;
    uploadEl.classList.toggle("is-full", full);
    filesEl.disabled = full;
    uploadEl.querySelector(".upload__text").innerHTML = full
      ? `이미지 ${MAX_FILES}장을 모두 선택했습니다`
      : `<strong>클릭해서 선택</strong>하거나 이미지를 끌어다 놓으세요`;
  };

  const addFiles = (list) => {
    const rejected = [];

    for (const file of list) {
      if (picked.length >= MAX_FILES) {
        rejected.push(`최대 ${MAX_FILES}장까지 첨부할 수 있습니다.`);
        break;
      }
      if (!ALLOWED.includes(file.type)) {
        rejected.push(`${file.name} — 이미지 파일만 첨부할 수 있습니다.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        rejected.push(`${file.name} — 장당 ${prettySize(MAX_BYTES)}까지 가능합니다.`);
        continue;
      }
      // 같은 파일을 두 번 고른 경우 걸러낸다
      if (picked.some((f) => f.name === file.name && f.size === file.size)) continue;

      picked.push(file);
    }

    renderPreview();
    if (rejected.length) setStatus(rejected[0], "bad");
    else if (statusEl.classList.contains("is-bad")) setStatus("", null);
  };

  filesEl.addEventListener("change", () => {
    addFiles(filesEl.files);
    filesEl.value = ""; // 같은 파일을 다시 고를 수 있도록 비운다
  });

  ["dragenter", "dragover"].forEach((ev) =>
    uploadEl.addEventListener(ev, (e) => {
      e.preventDefault();
      if (picked.length < MAX_FILES) uploadEl.classList.add("is-drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    uploadEl.addEventListener(ev, () => uploadEl.classList.remove("is-drag"))
  );
  uploadEl.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  /* 업로드 진행 표시 --------------------------------------------------- */
  const setProgress = (done, total) => {
    progressEl.classList.toggle("is-on", total > 0 && done < total);
    progressBar.style.width = total ? `${(done / total) * 100}%` : "0";
  };

  /* 서명 URL로 직접 업로드 -------------------------------------------- */
  const uploadAll = async (uploads) => {
    setProgress(0, uploads.length);

    for (let i = 0; i < uploads.length; i++) {
      const res = await fetch(uploads[i].url, {
        method: "PUT",
        headers: { "Content-Type": picked[i].type },
        body: picked[i],
      });
      if (!res.ok) throw new Error(`upload ${res.status} ${await res.text()}`);
      setProgress(i + 1, uploads.length);
    }
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

    const turnstileToken = turnstileReady && window.turnstile
      ? window.turnstile.getResponse(turnstileWidgetId)
      : "";

    if (!turnstileToken) {
      setStatus("자동 입력 방지 확인이 끝나지 않았습니다. 잠시 후 다시 눌러주세요.", "bad");
      return;
    }

    submitEl.disabled = true;
    submitEl.textContent = "보내는 중...";

    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          turnstileToken,
          files: picked.map((f) => ({ type: f.type, size: f.size })),
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || `submit ${res.status}`);

      if (result.uploads?.length) {
        submitEl.textContent = "이미지 올리는 중...";
        await uploadAll(result.uploads);
      }

      form.reset();
      picked = [];
      renderPreview();
      setProgress(0, 0);
      updateCount();
      setStatus("문의가 접수되었습니다. 확인 후 회신드리겠습니다.", "ok");
    } catch (err) {
      console.error("[contact]", err);
      setProgress(0, 0);
      setStatus(
        String(err.message).startsWith("upload")
          ? "문의는 접수됐지만 이미지 업로드에 실패했습니다. 필요하면 다시 보내주세요."
          : err.message || "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        "bad"
      );
    } finally {
      // 토큰은 1회용이라 매번 새로 받아야 한다
      if (turnstileReady && window.turnstile) window.turnstile.reset(turnstileWidgetId);
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

  renderPreview();
}
