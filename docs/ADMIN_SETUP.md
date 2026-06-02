# Admin console setup (internal)

## Admin key (password)

Set the **same value** in both places:

1. GitHub Secret `ADMIN_SAVE_KEY` on **TBELL-ref/T-client** (and optionally **meowdule/T-client**)
2. Share internally with the team (not committed to git)

Example format (generate your own):

`Tbell-LeadConsole-2026-xK7!mNp9Qv3wR2zL8`

The site stores only a SHA-256 hash in `docs/admin.js`.

## Save flow (no PAT input in UI)

1. User enters admin key in the **관리** popup → unlock + consent
2. **저장 반영** → `repository_dispatch` → Actions validates `ADMIN_SAVE_KEY` → commits `overrides.json`
3. **키워드 반영** → public `save-keywords` + private `sync-keywords` (브라우저에서 직접 dispatch)
4. **크롤링 실행** → private `trigger-collect` → Lead Collector
5. Dispatch API auth uses **PUBLIC_REPO_TOKEN** embedded in `admin.js` (PAT must have `repo` scope on **meowdule/T-client**)

### One-time embed (after PUBLIC_REPO_TOKEN is in private `.env`)

```powershell
cd private-t-client
npm run embed:admin-auth
cd ../public-t-client
git add docs/admin.js
git commit -m "chore: embed admin dispatch auth"
git push
```

## GitHub Secrets checklist

| Repo | Secret | Purpose |
|------|--------|---------|
| TBELL-ref/T-client | `ADMIN_SAVE_KEY` | Validate admin console requests |
| meowdule/T-client | `ADMIN_SAVE_KEY` | Validate sync-keywords / trigger-collect |
| meowdule/T-client | `PUBLIC_REPO_TOKEN` | Publish snapshot + embed in admin.js dispatch |
