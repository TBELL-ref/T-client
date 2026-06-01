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
3. Dispatch API auth uses the same **PUBLIC_REPO_TOKEN** as meowdule publish (obfuscated in `admin.js`)

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
| TBELL-ref/T-client | `ADMIN_SAVE_KEY` | Validate save from console |
| meowdule/T-client | `ADMIN_SAVE_KEY` | Same (optional, private workflow) |
| meowdule/T-client | `PUBLIC_REPO_TOKEN` | Publish snapshot + server save |
