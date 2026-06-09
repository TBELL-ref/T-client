# T-client Public UI

GitHub Pages 대시보드. **모든 데이터는 Supabase**에서 읽고, 편집은 자동 저장됩니다.

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
