-- =========================================================
--  문의 접수 테이블
--  Supabase 대시보드 → SQL Editor에 붙여넣고 Run
-- =========================================================

create table if not exists public.contacts (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null     default now(),
  name       text        not null,
  contact    text        not null,
  type       text        not null     default '기타',
  message    text        not null,
  handled    boolean     not null     default false   -- 회신 처리 여부 표시용
);

-- 최신 문의부터 보는 조회가 대부분이라 created_at 역순 인덱스
create index if not exists contacts_created_at_idx
  on public.contacts (created_at desc);


-- =========================================================
--  RLS — 접근 제어의 핵심
--  키가 브라우저에 공개되어 있으므로, 실제 방어선은 여기다.
-- =========================================================
alter table public.contacts enable row level security;

-- 방문자(anon)에게는 INSERT만 허용한다.
-- SELECT / UPDATE / DELETE 정책을 만들지 않으므로 그 동작들은 전부 차단된다.
-- → 남의 문의를 읽거나 지우는 것이 불가능하다.
drop policy if exists "anon can submit contact" on public.contacts;
create policy "anon can submit contact"
  on public.contacts
  for insert
  to anon
  with check (
    char_length(name)    between 1 and 40
    and char_length(contact) between 1 and 120
    and char_length(message) between 5 and 1000
    and type in ('강의', '소싱', '제휴', '기타')
  );

-- 위 with check는 브라우저 검증을 우회한 직접 호출까지 막는 2차 방어선이다.
-- 클라이언트 JS는 얼마든지 조작할 수 있으므로 길이 제한을 DB에서 한 번 더 건다.

-- ---------------------------------------------------------
--  컬럼 단위 INSERT 권한
--  RLS 정책만으로는 id · created_at · handled 값을 방문자가
--  직접 지정하는 것을 막지 못한다. 실제로 확인된 문제:
--    • created_at을 2020년으로 보내면 최신순 목록 맨 아래에 숨는다
--    • handled=true로 보내면 이미 처리된 문의로 위장된다
--  → 입력 가능한 컬럼 자체를 4개로 제한한다.
--    나머지는 테이블 기본값(now(), false, gen_random_uuid())만 쓰인다.
-- ---------------------------------------------------------
revoke insert on public.contacts from anon;
grant  insert (name, contact, type, message) on public.contacts to anon;
