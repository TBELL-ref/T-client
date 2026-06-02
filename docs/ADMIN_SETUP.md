# Admin console setup (GitHub Pages)

## Flow

1. User enters admin password in **관리** popup (validated by SHA-256 hash in `admin.js`).
2. Browser calls `repository_dispatch` on **TBELL-ref/T-client** only (embedded PAT).
3. Public Actions commit JSON and chain private jobs via `GH_PAT` secret:
   - `save-keywords` → commit `keywords.json` → dispatch `sync-keywords` on meowdule/T-client
   - `trigger-collect` → dispatch Lead Collector on meowdule/T-client
4. Other public jobs: `save-overrides`, `enrich-company`.

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
| TBELL-ref/T-client | `ADMIN_SAVE_KEY` | Admin UI password |
| TBELL-ref/T-client | `GH_PAT` | Chain dispatch to meowdule/T-client (Actions + private repo access) |
| meowdule/T-client | `ADMIN_SAVE_KEY` | Validate private dispatches |
| meowdule/T-client | `GH_PAT` | Publish snapshot (CI only) |

## Fine-grained PAT (browser embed)

Embedded PAT needs **public repo only**:

| Repository | Permissions |
|------------|-------------|
| **TBELL-ref/T-client** | Contents: Read and write · Actions: Read and write · Metadata: Read |

`GH_PAT` (repo secret, not embedded) must reach **meowdule/T-client**:

| Repository | Permissions |
|------------|-------------|
| **meowdule/T-client** | Actions: Read and write · Metadata: Read |

## Security notes

- PAT is XOR-obfuscated in `admin.js` (not plain text). Still visible to determined users — use a dedicated token with minimal scope and rotate after the temp admin period.
- Private repo is never called from the browser; only GitHub Actions uses `GH_PAT`.
- Admin password is kept in **memory only** during the session (`state.adminKey`), not in sessionStorage.
- Only `SS_ADMIN` unlock flag uses sessionStorage (no PAT, no password persisted).
