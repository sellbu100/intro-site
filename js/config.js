/* =========================================================
   프런트엔드 설정
   ---------------------------------------------------------
   문의 접수는 /api/contact 서버 함수를 거친다.
   Supabase URL·키는 서버(Vercel 환경변수)에만 있고
   브라우저로는 나오지 않는다.

   turnstile.siteKey는 공개되는 값이 맞다. (위젯을 그리는 데 쓰인다)
   실제 검증은 서버가 secret key로 수행한다.
   ========================================================= */
window.SITE_CONFIG = {
  endpoint: "/api/contact",

  turnstile: {
    siteKey: "0x4AAAAAAEwSfqW9F8J5K7OV",
  },

  upload: {
    maxFiles: 3,
    maxFileBytes: 5 * 1024 * 1024, // 5MB — 서버·버킷에도 같은 제한이 걸려 있다
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
};
