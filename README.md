# T-client

Public GitHub Pages shell for the QA lead dashboard.

## Live data
- First crawl snapshot: 8 QA hiring companies, 14 job posts
- Data file: `docs/data/snapshot.json` (served on Pages)

## Principles
- No crawler/business logic
- No secrets
- Read-only UI from snapshot JSON

## UX
- Table-first layout, KPI cards, filter presets
- Company job groups, dedupe review, manual queue tabs

## Deploy
- GitHub Pages source: `/docs`
- Workflow audits snapshot before deploy
