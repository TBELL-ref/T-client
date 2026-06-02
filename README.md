# T-client (Public Pages)

QA lead dashboard: https://tbell-ref.github.io/T-client/

## Admin (internal)

- Click **관리** (top right) → small popup → enter admin key
- Password = unlock + consent to save via GitHub Actions (no PAT field)
- See [docs/ADMIN_SETUP.md](docs/ADMIN_SETUP.md) for `ADMIN_SAVE_KEY`, gateway (Vercel), and GitHub Secrets

## Data

- `docs/data/snapshot.json` — crawl output
- `docs/data/overrides.json` — favorites & edits (survives re-crawl)

## Deploy

- GitHub Pages source: `/docs`
