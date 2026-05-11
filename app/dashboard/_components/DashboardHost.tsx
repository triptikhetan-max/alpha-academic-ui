/**
 * DashboardHost — server component that renders the static markup of the
 * Brain Dashboard and bootstraps the vanilla JS app inside it.
 *
 * The body HTML is read from `public/dashboard-assets/body.html` (synced
 * from the source UI kit via `scripts/sync-dashboard-assets.sh`).
 *
 * The DRI scope is injected as `window.DRI_MODE` BEFORE render.js runs,
 * and an optional initial hash route can be set (used by /dashboard/triage).
 *
 * Data is fetched at runtime by `render.js` via the patched
 * `window.__BOOT_FETCH_DATA()` hook → /api/dashboard-data.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { DriScope } from "@/lib/dri-scopes";

interface DashboardHostProps {
  scope: DriScope;
  /** Optional hash route to navigate to on load, e.g. "#/triage". */
  initialHash?: string;
}

const BODY_PATH = path.join(
  process.cwd(),
  "public",
  "dashboard-assets",
  "body.html"
);

function loadBodyHtml(): string {
  if (!existsSync(BODY_PATH)) {
    return `
      <main style="padding:48px;font-family:system-ui;max-width:640px;margin:0 auto;">
        <h1 style="font-size:22px;">Dashboard assets not synced</h1>
        <p>Run <code>npm run sync:dashboard</code> to copy the static assets
        from the brain UI kit into <code>public/dashboard-assets/</code>.</p>
      </main>
    `;
  }
  return readFileSync(BODY_PATH, "utf8");
}

export function DashboardHost({ scope, initialHash }: DashboardHostProps) {
  const bodyHtml = loadBodyHtml();

  // Stringify DRI mode for safe inline injection. JSON.stringify escapes
  // </script> inside strings adequately for our static known-good data,
  // but we also defensively replace `<` to be safe.
  const driJson = JSON.stringify(scope).replace(/</g, "\\u003c");
  const hashJson = JSON.stringify(initialHash ?? "");

  return (
    <>
      {/* Stylesheets — synced from the brain UI kit. */}
      <link rel="stylesheet" href="/dashboard-assets/tokens-cool.css" />
      <link rel="stylesheet" href="/dashboard-assets/tokens-mono.css" />
      <link rel="stylesheet" href="/dashboard-assets/tokens-dark.css" />
      <link rel="stylesheet" href="/dashboard-assets/app.css" />

      {/* Inject DRI scope + initial hash BEFORE render.js loads. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.DRI_MODE = ${driJson};
            (function () {
              var h = ${hashJson};
              if (h && typeof window !== 'undefined') {
                try { window.location.hash = h; } catch (e) {}
              }
            })();
          `,
        }}
      />

      {/* The dashboard body markup, copied from the source UI kit. */}
      <div
        id="dashboard-root"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {/* charts.js + the patched render.js. Order matters. */}
      <script src="/dashboard-assets/charts.js" defer />
      <script src="/dashboard-assets/render.js" defer />
    </>
  );
}
