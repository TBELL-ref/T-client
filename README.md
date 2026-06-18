# T-client Public UI

GitHub Pages 대시보드. **모든 데이터는 Supabase**에서 읽고, 편집은 자동 저장됩니다.

## 로컬에서 UI 보기

```powershell
cd docs
npx --yes serve -l 3456
# 브라우저: http://localhost:3456
```

`supabase-config.js`가 있어야 데이터가 로드됩니다 (아래 embed 참고).

**탭 안내:** 기본 화면은 **회사** 탭(전체 목록)입니다. **신규** 탭은 비로그인 시 직전 크롤 신규만, 로그인 시 미열람 회사만 표시되어 비어 있을 수 있습니다. **제외** 탭에는 분류 「숨김」·제외 사유 회사만 표시됩니다. migration `013`·`014` 미적용 시 일부 RPC는 동작하지 않을 수 있습니다.

## 설정 (private 쪽에서 진행)

상세 절차: **[private-t-client/docs/README.md](../private-t-client/docs/README.md)** §7 Pages UI 연결

```powershell
cd ../private-t-client
npm run embed:supabase-config   # docs/supabase-config.js 생성
npm run embed:admin-auth        # docs/admin.js dispatch 토큰
cd ../public-t-client
git push                        # Pages 자동 배포
```

## 필요한 것 (public repo)

| 항목 | 필요 여부 |
|------|-----------|
| GitHub Secrets (데이터) | ❌ 없음 |
| `docs/supabase-config.js` | ✅ embed 스크립트로 생성 |
| Supabase Auth Redirect URL | ✅ Pages URL 등록 |

## 데이터 접근

| UI | Supabase |
|----|----------|
| 대시보드 | `get_published_snapshot` |
| 영업/파이프라인 | `sales_management` 테이블 (`upsert_sales_management`) |
| 편집 overrides | `save_overrides_doc` (프로필·공고, JWT 자동 저장) |
| 키워드 | `save_keywords_doc` |
| 크롤 요청 | `request_crawl` + GitHub Actions |

## 로그인

허용 이메일(`config/allowed-emails.txt`)만 이메일+비밀번호 로그인 가능 (최초 1회 비밀번호 설정 메일).

**로컬(`localhost`)도 동일합니다.** 수정·병합·삭제는 로그인 후에만 동작하며, 비로그인 시에도 버튼은 표시됩니다(클릭 시 관리자 로그인 창).
