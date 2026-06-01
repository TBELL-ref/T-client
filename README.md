# T-client Public

Public GitHub Pages shell for the QA lead dashboard.

## Phase 6 UX
- Table-first layout for leads, dedupe review, and manual queue
- KPI summary cards
- Quick filter presets (A등급, 리포트 필요, 미팅 필요, etc.)
- Column sort on lead table
- Expandable company job-post groups with failure highlighting
- B2B report-style palette (neutral + warm accent, no AI gradient)

## Phase 7 Security + deploy
- Pre-deploy snapshot audit blocks sensitive patterns
- Pages deploy runs only after audit passes
- No secrets in this repository

## Principles
- No crawler/business logic
- No secrets
- Read-only UI from `data/snapshot.json`
