# Admin console setup

## Architecture

- **Browser** (`docs/admin.js`): admin password check (SHA-256 hash only in JS). Sends `{ adminKey, action, payload }` to **`/api/admin` gateway** — no PAT, no `api.github.com` calls.
- **Gateway** (`api/admin.js` on Vercel/Netlify): validates `ADMIN_SAVE_KEY`, calls GitHub API with **`GH_PAT` from server env** → `repository_dispatch` on `TBELL-ref/T-client`.
- **Public Actions** (`admin-gateway.yml`): validates `adminKey`, writes public JSON, forwards crawl/keywords to **meowdule/T-client** using **`secrets.GH_PAT`**.
- **Private Actions** (`lead-collector.yml`, `sync-keywords`): crawl, Sheets, publish.

## GitHub Secrets

### TBELL-ref/T-client (public)

| Secret | Purpose |
|--------|---------|
| `ADMIN_SAVE_KEY` | Same password as admin UI (validated in workflows + gateway env) |

### meowdule/T-client (private)

| Secret | Purpose |
|--------|---------|
| `ADMIN_SAVE_KEY` | Validate `repository_dispatch` |
| `GH_PAT` | Publish snapshot, dispatch private/public workflows (repo + `actions:write`) |
| `GOOGLE_*` | Sheets (existing) |

### Vercel / Netlify (gateway host)

| Env | Purpose |
|-----|---------|
| `ADMIN_SAVE_KEY` | Same value as GitHub Secret |
| `GH_PAT` | Same PAT as private `GH_PAT` secret |

## Deploy gateway (required for admin buttons)

GitHub Pages alone cannot run `/api/admin`. Use **one** of:

### Option A — Vercel (recommended)

1. Import `TBELL-ref/T-client` on Vercel, root `public-t-client`, output `docs`.
2. Set env: `ADMIN_SAVE_KEY`, `GH_PAT`.
3. In `docs/index.html` uncomment and set:
   ```html
   <meta name="tclient-admin-gateway" content="https://YOUR-PROJECT.vercel.app/api/admin" />
   ```
4. Redeploy Pages or use Vercel URL for the app.

### Option B — Manual workflow (no gateway)

GitHub → **TBELL-ref/T-client** → Actions → **Admin Gateway** → **Run workflow**  
Fill `admin_key`, `action`, `payload_json`.

## Admin password

Set the same value in:

- `ADMIN_SAVE_KEY` (GitHub Secrets + Vercel env)
- Share with team (not committed)

Only a **SHA-256 hash** of the password is stored in `docs/admin.js` for client-side unlock check.

## Removed (do not use)

- `npm run embed:admin-auth`
- `PUBLIC_REPO_TOKEN` in browser / `admin.js`
- PAT in `DISPATCH_AUTH_XOR`
