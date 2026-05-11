/**
 * GET /api/dashboard-data
 *
 * Auth-gated proxy that serves data.json to the Brain Dashboard front-end,
 * filtered server-side by the caller's DRI scope. This is the actual
 * authorization boundary — the in-browser render.js never sees rows
 * outside the user's scope.
 *
 * Data source: Vercel Blob (PRIVATE), at pathname `dashboard/data.json`.
 * Uploaded by `scripts/upload-data-to-blob.ts` via the nightly cron.
 * Fetched here server-side using `head()` + `Authorization: Bearer ${BLOB_READ_WRITE_TOKEN}`.
 * The blob is never publicly accessible — the API route is the only auth boundary.
 *
 * Returns a `data_pending` envelope when no upload has happened yet so
 * the UI can render an onboarding message instead of crashing.
 *
 * Security:
 *   - 401 unauthenticated, 403 no scope, 500 generic server error
 *   - Cache-Control: private, no-store on every response
 *   - Vary: Cookie, Authorization on every response
 *   - Never returns the Blob URL or the Blob token to the browser
 *   - Never logs student names, emails, scores, picked answers, AI narratives,
 *     or full payloads. Only domain-only / pathname-only / status-code logs.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scopeForEmail } from "@/lib/dri-scopes";
import { dashboardJson } from "@/lib/dashboard/headers";
import {
  fetchSourceData,
  filterDataForScope,
  isPending,
} from "@/lib/dashboard/scopedData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function emailHash(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12);
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return dashboardJson({ ok: false, error: "Unauthorized" }, 401);
  }

  const scope = scopeForEmail(email);
  if (!scope) {
    // Log a hash of the email + the host domain only — never the address itself.
    console.warn(
      `dashboard-data unauthorized email_hash=${emailHash(email)}`
    );
    return dashboardJson({ ok: false, error: "Forbidden" }, 403);
  }

  try {
    const raw = await fetchSourceData();
    if (isPending(raw)) {
      // Pending envelope is intentionally surfaced to the UI so it can render
      // an onboarding state. Nothing PII in this branch.
      return dashboardJson(raw, 200);
    }
    const filtered = filterDataForScope(raw, scope);
    console.log(
      `dashboard-data request authorized scope=${scope.dri}`
    );
    return dashboardJson(filtered, 200);
  } catch (err: unknown) {
    // Generic server error — never leak internal details or stack traces.
    const code = err instanceof Error ? err.name : "unknown";
    console.error(`dashboard-data internal_error code=${code}`);
    return dashboardJson(
      { ok: false, error: "Internal server error" },
      500
    );
  }
}
