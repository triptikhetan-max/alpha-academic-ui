# alpha-academic-ui

Public web UI for the Alpha academic knowledge base (Google SSO) + the **consolidation target for V1+V2+Guide dashboards** per Apr 27 decision.

## Status
- 🚧 MIGRATING — new dashboard feature ready for review
- Branch: `feat/dri-dashboard-digest` (PR'd 2026-05-11, awaiting merge)
- Prod: https://alpha-academic-ui.vercel.app
- GitHub: `triptikhetan-max/alpha-academic-ui`

## Run

```bash
cp .env.example .env.local        # fill in (see env vars below)
npm install
npm run dev                       # http://localhost:3000
git checkout feat/dri-dashboard-digest    # the active feature branch
```

## Architecture

```
Browser
   ↓ Google SSO (NextAuth v5, gated to Alpha-affiliated domains)
Next.js on Vercel (this repo)
   ↓ server-side fetch with shared API key
alpha-academic-api (FastAPI, private)
   ↓
knowledge.db (brain_md-derived)
```

## Files to know

On `feat/dri-dashboard-digest` (NEW dashboard work):
- `app/dashboard/{guide,student,manager,master,subject,triage,actions,data-health}/`
- `app/api/cron/dashboard-digest/route.ts` — daily 11am UTC digest
- `app/api/dashboard/`, `app/api/dashboard-data/` — auth-gated data
- `lib/dashboard/`, `lib/dri-scopes.ts` — DRI scoping
- `lib/emails/`, `lib/mailer.ts` — Gmail digest
- `components/dashboard/` — 32 components

On main (chat-style answer surface):
- `app/page.tsx` — Q&A interface
- `app/api/ask/` — proxy to alpha-academic-api

## Env vars (`.env.example`)

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — SSO
- `ALPHA_API_URL`, `ALPHA_API_KEY` — FastAPI auth
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_CC` — digest email
- `CRON_SECRET` — guards cron endpoint
- `DASHBOARD_ORIGIN`, `ALPHA_CLIENT_ID/SECRET` (optional, for live-activity)

## Patterns

- SSO gates to: `@alpha.school`, `@2hourlearning.com`, `@trilogy.com`, `@incept.ai`, `@superbuilders.school`, `@reachbeyond.ai`
- Server-side fetches with API key — never expose to client
- Cron via `vercel.json` (daily 11am UTC)

## Don't

- Don't merge `feat/dri-dashboard-digest` to main without setting env vars in Vercel (cron + mailer will silently fail)
- Don't add features in V1/V2/Guide that should go here — this is the consolidation target
- Don't expose `ALPHA_API_KEY` to client — server-side only

## Common asks → what to do

- "Add a new dashboard view" → `app/dashboard/<view>/` + components/dashboard/
- "Switch to a different brain backend" → change `ALPHA_API_URL`; long-term will point at `alpha-brain-v2/api/`
- "Test the digest email" → set env vars locally, hit `/api/cron/dashboard-digest` with CRON_SECRET
- "Where's permission logic?" → `lib/dri-scopes.ts`

## Skills to invoke

- `superpowers:requesting-code-review` before merging the feature PR
- `vercel:nextjs` for App Router patterns
- `vercel:auth` if touching SSO
- `react-best-practices` for TSX changes

## Gotchas

- 79 files / 25K+ lines on the feature branch — substantial review
- Daily 11am UTC cron — env vars in Vercel before merge
- Long-term: will absorb V1+V2+Guide

## See also

- `_STATE/alpha-academic-ui.md`
- `_STATE/_RELATIONSHIPS.md` — consolidation story
- `_STATE/_CANONICAL.md` — dashboard version status
- Siblings: V1/V2/Guide (becoming legacy here), `alpha-academic-api` (backend)
