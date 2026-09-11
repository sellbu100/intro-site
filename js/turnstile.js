/* =========================================================
   Turnstile 위젯 공통 처리
   ---------------------------------------------------------
   문의 폼(index.html)과 AI 도구(ai.html)가 함께 쓴다.

   위젯을 담는 div의 id는 반드시 "turnstile-box"다.
   "turnstile"로 두면 id가 같은 이름의 전역으로 노출되어
   window.turnstile(Cloudflare API)을 가려버린다.
   ========================================================= */
window.TurnstileWidget = (() => {
  let widgetId = null;
  let ready = false;

  const render = () => {
    if (ready) return;

    const host = document.getElementById("turnstile-box");
    const siteKey = window.SITE_CONFIG?.turnstile?.siteKey;
    if (!host || !siteKey || typeof window.turnstile?.render !== "function") return;

    try {
      widgetId = window.turnstile.render(host, {
        sitekey: siteKey,
        theme: "light",
        language: "ko",
      });
      ready = widgetId !== undefined;
    } catch (err) {
      console.error("[turnstile] 위젯을 그리지 못했습니다:", err);
    }
  };

  // api.js는 async로 붙는다. 콜백이 먼저 불릴 수도, 나중에 불릴 수도 있어
  // 세 경로 모두에서 시도한다. render()가 자체적으로 중복을 막는다.
  window.onTurnstileReady = render;
  render();
  document.addEventListener("DOMContentLoaded", render);

  return {
    isReady: () => ready,
    getToken: () => (ready && window.turnstile ? window.turnstile.getResponse(widgetId) || "" : ""),
    // 토큰은 1회용이라 전송 후 매번 새로 받아야 한다
    reset: () => {
      if (ready && window.turnstile) window.turnstile.reset(widgetId);
    },
  };
})();
