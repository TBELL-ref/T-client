# T-client (Public Pages)

QA lead dashboard: https://tbell-ref.github.io/T-client/

## Data
- `docs/data/snapshot.json` — crawl output (read-only base)
- `docs/data/overrides.json` — favorites & admin edits (survives re-crawl)

## Admin mode (internal)
1. Click **관리** (top right)
2. Password: `tbell0518!`
3. Star favorites, edit notes/grade/hide in **상세** modal
4. **GitHub 저장**: enter a [fine-grained PAT](https://github.com/settings/tokens) with `Contents: Read and write` on this repo (stored in browser session only)

Edits save to `localStorage` immediately. **GitHub 저장** updates `overrides.json` so the private collector merges them on the next crawl.

## Archive branches
Each private `publish:snapshot` run creates `archive/YYYY-MM-DDTHH-mm-ss` with `sheets-export.json` (Google Sheets dump).

## Deploy
- GitHub Pages source: `/docs`
