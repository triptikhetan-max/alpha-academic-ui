# alpha-academic-ui

**Public-facing front-end** for the Alpha Academic knowledge base. Google SSO gated to Alpha-affiliated domains. Calls private `alpha-academic-api` server-side so users never see API keys.

Also the **target of dashboard consolidation** per Apr 27 decision — `app/dashboard/` will absorb V1 + V2 + Guide functionality + add new manager/master/subject/triage views.

## Stack
- Next.js 16 + React 19 + TypeScript + Tailwind
- NextAuth/Auth.js v5 (Google SSO)
- `@anthropic-ai/sdk`, `@vercel/blob`, `nodemailer`
- Vercel deploy: https://alpha-academic-ui.vercel.app
- GitHub: `triptikhetan-max/alpha-academic-ui`
- Current branch: `feat/dri-dashboard-digest` (PR'd 2026-05-11, awaiting review/merge)

## How to run

```bash
cd ~/Projects/alpha-academic-ui
cp .env.example .env.local       # then fill in
npm install
npm run dev                      # http://localhost:3000
git checkout feat/dri-dashboard-digest   # for the new dashboard feature
```

## Env vars

Per `.env.example`:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — SSO
- `ALPHA_API_URL`, `ALPHA_API_KEY` — FastAPI auth
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_CC` — daily digest emails
- `CRON_SECRET` — guards the cron endpoint
- `DASHBOARD_ORIGIN` — deployed URL
- `ALPHA_CLIENT_ID/SECRET` — Cognito M2M creds (optional)

## Key files (on the feature branch)

- `app/dashboard/{guide,student,manager,master,subject,triage,actions,data-health}/` — 8 dashboard views
- `app/api/cron/dashboard-digest/route.ts` — daily 11am UTC email digest
- `app/api/dashboard/`, `app/api/dashboard-data/` — auth-gated data routes
- `lib/dashboard/`, `lib/dri-scopes.ts` — DRI permission model
- `lib/emails/`, `lib/mailer.ts` — Gmail-based digest emails
- `components/dashboard/` — 32 dashboard components (StudentHeader, SubjectBreakdown, EvidenceTimeline, MasterTriageQueue, EscalationModal, GuideKpiChips, etc.)
- `vercel.json` — cron registration

## Architecture

```
Browser
  │ (Google SSO via NextAuth)
  ▼
Next.js on Vercel (this repo)
  │ (server-side fetch with shared API key)
  ▼
alpha-academic-api (FastAPI)
  │
  ▼
knowledge.db (brain_md-derived)
```

## Gotchas

- The PR'd feature branch has 25K+ insertions across 79 files — substantial review
- Daily digest cron at 11am UTC — make sure env vars are set in Vercel before merge
- This is the consolidation target — eventually retires V1, may absorb V2 + Guide
- SSO is gated to `@alpha.school`, `@2hourlearning.com`, `@trilogy.com`, `@incept.ai`, `@superbuilders.school`, `@reachbeyond.ai`

## See also

- `_STATE/alpha-academic-ui.md`
- `_STATE/_RELATIONSHIPS.md` — V1/V2/Guide → academic-ui consolidation story
