# intro-site

회사/개인 소개 웹사이트 프로젝트.

**배포 주소:** https://intro-site-eta.vercel.app

## 폴더 구조

```
intro-site/
├── index.html          # 메인 페이지
├── css/style.css       # 스타일
├── js/
│   ├── config.js       # Supabase 접속 정보
│   ├── main.js         # 스크롤·네비게이션
│   └── contact.js      # 문의 폼 전송
├── supabase/
│   └── schema.sql      # 테이블 · 보안 정책
├── assets/images/      # 이미지 파일
├── .gitignore
└── README.md
```

## 문의 확인하는 법

접수된 문의는 Supabase 대시보드 → **Table Editor** → `contacts` 에서 봅니다.
사이트 방문자는 문의를 **작성만** 할 수 있고 읽거나 지울 수 없습니다.

회신을 마친 문의는 `handled` 를 `true` 로 바꿔두면 처리 여부를 구분할 수 있습니다.

## 진행 단계

- [x] ① 프로젝트 폴더 생성
- [x] ② 웹사이트 제작
- [x] ③ 로컬에서 사이트 확인
- [x] ④ GitHub 저장소 생성
- [x] ⑤ GitHub에 업로드
- [x] ⑥ Vercel 연결 + 배포
- [x] ⑦ Supabase 연결 — 문의 폼 접수
- [ ] ⑧ 이미지 Storage 연결 (필요시)
- [ ] ⑨ API 연결 (필요시)
- [ ] ⑩ 도메인 연결
- [ ] ⑪ 최종 테스트

## 로컬에서 보는 법

`index.html` 파일을 브라우저로 열면 됩니다.

정적 서버로 확인하려면 (Node 설치 필요):

```bash
npx serve .
```
