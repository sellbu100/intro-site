/* =========================================================
   Supabase 설정
   ---------------------------------------------------------
   아래 두 값은 Supabase 대시보드에서 확인합니다.
     Project Settings → API
       • Project URL          → SUPABASE_URL
       • anon / public key    → SUPABASE_ANON_KEY

   ⚠️ anon key는 브라우저에 공개되는 것이 정상입니다.
      접근 제어는 키가 아니라 테이블의 RLS 정책으로 합니다.
   ⚠️ service_role key는 절대 여기에 넣지 마세요. (서버 전용)
   ========================================================= */
window.SUPABASE_CONFIG = {
  url: "https://uwovwdwrcvspcumlslov.supabase.co",
  anonKey: "sb_publishable_tp8CyF0eASFLX1tLZltVyQ_zn-3dsMX",
  table: "contacts",
};
