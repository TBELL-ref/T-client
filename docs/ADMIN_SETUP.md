# Admin console setup (GitHub Pages)

## Flow

1. User enters admin password in **관리** popup (validated by SHA-256 hash in `admin.js`).
2. Browser calls GitHub `repository_dispatch` with **two embedded Fine-grained PATs** (XOR in `admin.js`).
3. **TBELL-ref/T-client** (`PUBLIC_REPO_TOKEN`): `save-overrides`, `save-keywords`, `enrich-company`.
4. **meowdule/T-client** (`PRIVATE_REPO_TOKEN`): `sync-keywords`, `sync-notion`, `trigger-collect` → Admin Console / Lead Collector.

## One-time embed (after both tokens are in `private-t-client/.env`)

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
PUBLIC_REPO_TOKEN=github_pat_...   # TBELL-ref/T-client
PRIVATE_REPO_TOKEN=github_pat_...  # meowdule/T-client
```

Never commit `.env`.

## GitHub Secrets (Actions CI only)

| Repo | Secret | Purpose |
|------|--------|---------|
| TBELL-ref/T-client | `ADMIN_SAVE_KEY` | Admin UI password |
| meowdule/T-client | `ADMIN_SAVE_KEY` | Validate private dispatches |
| meowdule/T-client | `GH_PAT` | Publish snapshot (CI only) |
| meowdule/T-client | `NOTION_API_KEY` | Notion integration token (`sync-notion`) |
| meowdule/T-client | `NOTION_DATABASE_ID` | Notion DB id (optional; default in mapping) |

Browser embed tokens are separate from `GH_PAT`.

## Fine-grained PAT (browser embed)

Use **two tokens** — one per repo owner:

| Token | Repository | Permissions |
|-------|------------|-------------|
| `PUBLIC_REPO_TOKEN` | **TBELL-ref/T-client** | Contents: Read and write · Actions: Read and write · Metadata: Read |
| `PRIVATE_REPO_TOKEN` | **meowdule/T-client** | Actions: Read and write · Metadata: Read |

## Security notes

- Both PATs are XOR-obfuscated in `admin.js` (not plain text). Still visible to determined users — use dedicated tokens with minimal scope and rotate after the temp admin period.
- Admin password is kept in **memory only** during the session (`state.adminKey`), not in sessionStorage.
- Only `SS_ADMIN` unlock flag uses sessionStorage (no PAT, no password persisted).
