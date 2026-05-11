# Alpha Academic UI

A simple, beautiful web UI for the Alpha Academic knowledge base. Sign in with your Alpha-affiliated Google account, ask anything, get answers grounded in our team's playbooks, decisions, DRIs, and 1,759 documents.

**Live URL** *(once deployed)*: `https://alpha-academic.vercel.app`

This is the **public-facing front-end**. It calls the existing private API (`alpha-academic-api`) server-side, so users never see API keys.

---

## What it does

- 🔐 **Google SSO** gated to `@alpha.school`, `@2hourlearning.com`, `@trilogy.com`, `@incept.ai`, `@superbuilders.school`, `@reachbeyond.ai`
- 💬 **Ask anything** — chat-style box, three-pillar answers (what we know · who to contact · where the doc is)
- 📄 **PDF/article quoting** — answers quote the actual playbook content, not just a link
- 🚩 **Flag-a-gap** button — when Claude gets something wrong, teammate clicks → Tripti gets it on the next refresh
- ⚡ **No install, no API key, no terminal** — anyone with an Alpha email visits a URL and asks

## Architecture

```
Browser
   │ (Google SSO via NextAuth/Auth.js v5)
   ▼
Next.js app on Vercel  ← this repo
   │ (server-side fetch with shared API key)
   ▼
alpha-academic-api on Vercel  ← existing FastAPI
   │
   ▼
24MB SQLite + FTS5 (1,759 docs, 47 ADRs, 35 people, ...)
```

## Deploy in 5 steps (~15 minutes)

### 1. Set up Google OAuth credentials (one-time, ~5 min)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 client ID:
   - Type: **Web application**
   - Name: `Alpha Academic UI`
   - Authorized JavaScript origins: `https://alpha-academic.vercel.app` (and `http://localhost:3000` for dev)
   - Authorized redirect URIs: `https://alpha-academic.vercel.app/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for dev)
3. Save the **Client ID** and **Client Secret**

### 2. Push this repo to GitHub

```bash
cd "/Volumes/T7 Shield/Dev/Projects/alpha-academic-ui"
git init && git add . && git commit -m "feat: initial alpha-academic UI"
gh repo create triptikhetan-max/alpha-academic-ui --public --source . --push
```

(Public is fine — no data in the repo, just code. Or private if you prefer.)

### 3. Deploy to Vercel

1. https://vercel.com/new → import `alpha-academic-ui` from GitHub
2. Framework: **Next.js** (auto-detected)
3. Click **Deploy**

### 4. Set environment variables in Vercel

In Vercel → Project → Settings → Environment Variables, add four:

| Name | Value |
|---|---|
| `AUTH_SECRET` | generate with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `ALPHA_API_KEY` | one of the keys saved in your Notes (use the **`workflow`** one) |

`ALPHA_API_URL` defaults to `https://alpha-academic-api.vercel.app` and doesn't need to be set unless you change the API.

### 5. Redeploy

Settings → Deployments → latest → **Redeploy** so the env vars apply.

That's it. Visit your URL, sign in with `tripti.khetan@trilogy.com`, ask "who owns Math 3-5?".

## Local development

```bash
npm install
cp .env.example .env.local
# fill in the four secrets in .env.local
npm run dev
# open http://localhost:3000
```

## What teammates do

1. Visit the URL.
2. Click "Sign in with Google" → pick their Alpha email.
3. Type a question. Get an answer.

That's the whole onboarding. No GitHub, no Claude Code, no API key.

## When something is wrong

Below every answer there's a small "Flag a gap →" link. Teammates click → write what's wrong → it sends to the API's `/feedback` endpoint → lands in `_gaps.md` for Tripti's weekly review.

## Notes

- **Per-user analytics**: today the UI uses one shared API key, so the upstream API logs all queries against that key. To get per-user FAQ + gap tracking, the upstream API would need a `reported_by` parameter (small change). Not blocking for the pilot.
- **The plugin still works**: power users on Claude Code can still install `alpha-academic-remote` from `triptikhetan-max/alpha-public`. The UI and the plugin both call the same API.
- **Refresh cadence**: nothing in this UI changes when the brain refreshes. The API serves the latest knowledge.db automatically.

---

## Dashboard integration

The Brain Dashboard (Campus Console) is hosted under `/dashboard` as auth-gated pages reusing the same NextAuth Google SSO. Source assets live in the `brain` UI kit on the T7 Shield; copies are synced into `public/dashboard-assets/` and a small bootstrap shim is appended to `render.js` so it fetches data from `/api/dashboard-data` instead of the inlined base64 blob.

### Routes

| Path | Who lands here | Notes |
|---|---|---|
| `/dashboard` | Tripti (master) and most DRIs | Master view |
| `/dashboard/triage` | Claudio | Boots into the `#/triage` hash route |
| `/api/dashboard-data` | All DRIs | Auth-gated proxy that returns scope-filtered `data.json` |

DRIs are configured in `lib/dri-scopes.ts`. Each entry pins the user to a set of campuses + levels. The API route enforces the filter server-side; the in-browser `render.js` never sees out-of-scope rows.

### Env vars

| Name | Purpose |
|---|---|
| `DASHBOARD_DATA_URL` | Vercel Blob URL produced by `npm run upload:data`. Until set, `/api/dashboard-data` returns a `data_pending` envelope and the dashboard renders an onboarding message. |
| `BLOB_READ_WRITE_TOKEN` | Used only by `npm run upload:data`. Never set this in the deployed app. |

### Sync flow

```bash
# Re-copy CSS, charts.js, body markup, and the patched render.js from the
# source UI kit on T7 Shield. Run after every UI kit change.
npm run sync:dashboard

# Upload the freshly built data.json to Vercel Blob. Run nightly after
# the brain pipeline regenerates data.json. The cron entry-point is
# `Work/Alpha/brain/.../daily_refresh.sh`; add a step there:
#
#   cd /path/to/alpha-academic-ui && BLOB_READ_WRITE_TOKEN=... npm run upload:data
#
# Then copy the printed URL into Vercel as DASHBOARD_DATA_URL.
BLOB_READ_WRITE_TOKEN=... npm run upload:data
```

### What does NOT work on first deploy (until the Blob is uploaded)

- `/dashboard` will load the static UI but show a "Data is still being prepared" notice in place of the populated views. This is intentional — the API returns `{ status: "data_pending", … }` when `DASHBOARD_DATA_URL` is unset.
- After the first `npm run upload:data` run and setting `DASHBOARD_DATA_URL` in Vercel, the dashboard populates normally.
