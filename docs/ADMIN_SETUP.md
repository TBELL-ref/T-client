# Admin console setup (GitHub Pages)

## Flow

1. User enters admin password in **관리** popup (validated by SHA-256 hash in `admin.js`).
2. Buttons call GitHub `repository_dispatch` via **embedded Fine-grained PAT** (XOR in `admin.js`, not in sessionStorage).
3. **TBELL-ref/T-client** Actions: `save-overrides`, `save-keywords`, `enrich-company`.
4. **meowdule/T-client** Actions: `sync-keywords`, `trigger-collect` → Lead Collector.

## One-time embed (after PAT is in `private-t-client/.env`)

```powershell
cd private-t-client
npm run embed:admin-auth
cd ../public-t-client
git add docs/admin.js
git commit -m "chore: embed admin dispatch auth"
git push
```

## `.env` (private-t-client, local only)

```env
PUBLIC_REPO_TOKEN=github_pat_...
```

Never commit `.env`.

## GitHub Secrets

| Repo | Secret | Purpose |
|------|--------|---------|
| TBELL-ref/T-client | `ADMIN_SAVE_KEY` | Same as admin UI password |
| meowdule/T-client | `ADMIN_SAVE_KEY` | Validate private dispatches |
| meowdule/T-client | `PUBLIC_REPO_TOKEN` or `GH_PAT` | Publish snapshot (CI only) |

## Fine-grained PAT (recommended)

Create one token with access to **both** repositories:

| Repository | Permissions |
|------------|-------------|
| **TBELL-ref/T-client** | Contents: Read and write · Actions: Read and write · Metadata: Read |
| **meowdule/T-client** | Contents: Read and write · Actions: Read and write · Metadata: Read |

Required for browser dispatch to both repos (public save + private crawl).

## Security notes

- PAT is XOR-obfuscated in `admin.js` (not plain text). Still visible to determined users — use a dedicated token with minimal scope and rotate after the temp admin period.
- Admin password is kept in **memory only** during the session (`state.adminKey`), not in sessionStorage.
- Only `SS_ADMIN` unlock flag uses sessionStorage (no PAT, no password persisted).
