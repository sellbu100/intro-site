-- =========================================================
--  문의 접수 스키마
--  Supabase 대시보드 → SQL Editor에 붙여넣고 Run
-- =========================================================

create table if not exists public.contacts (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null     default now(),
  name        text        not null,
  contact     text        not null,
  type        text        not null     default '기타',
  message     text        not null,
  image_paths text[]      not null     default '{}',   -- Storage 경로
  handled     boolean     not null     default false   -- 회신 처리 여부
);

-- 최신 문의부터 보는 조회가 대부분이라 created_at 역순 인덱스
create index if not exists contacts_created_at_idx
  on public.contacts (created_at desc);


-- =========================================================
--  접근 제어
--  ---------------------------------------------------------
--  접수는 전부 /api/contact (Vercel 서버 함수)를 거친다.
--  그 함수만 service_role 키를 가지고 있고, service_role은 RLS를
--  우회하므로 아래에 anon 정책을 만들 필요가 없다.
--
--  anon에게 아무 권한도 주지 않는 것이 핵심이다.
--  직접 호출 경로를 열어두면 Turnstile 캡차를 우회해서
--  그냥 DB로 쏘면 그만이므로, 캡차가 무의미해진다.
-- =========================================================
alter table public.contacts enable row level security;

-- 이전 단계에서 열어줬던 방문자 권한을 모두 회수한다
revoke all on public.contacts from anon;
drop policy if exists "anon can submit contact" on public.contacts;


-- =========================================================
--  Storage 버킷
--  public = false 이므로 URL을 알아도 파일을 열 수 없다.
--  업로드는 서버가 발급한 단기 서명 URL로만 이뤄진다.
--
--  용량·확장자 제한을 버킷 자체에 걸어두면, 서명 URL을 손에 넣더라도
--  5MB 초과나 이미지가 아닌 파일은 올릴 수 없다.
--  특히 .html·.svg 차단이 중요하다 — 스크립트를 올려 배포하는 통로가 된다.
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-uploads',
  'contact-uploads',
  false,
  5242880,  -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 방문자의 직접 업로드 권한도 회수한다
drop policy if exists "anon can upload contact image" on storage.objects;
