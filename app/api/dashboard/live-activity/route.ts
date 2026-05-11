/**
 * GET /api/dashboard/live-activity?student=<slug>&days=14
 *
 * Live (per-request) Timeback edubridge analytics fetch for a single
 * student. This is the "fresh as of now" XP / minutes / accuracy feed
 * surfaced on the unified Campus DRI student profile.
 *
 * Auth boundary:
 *   - Requires a valid NextAuth session (401 otherwise)
 *   - Resolves DRI scope server-side from session.email (403 if no scope)
 *   - Verifies the student is in the caller's scope (403 if out of scope)
 *
 * Data source resolution:
 *   1. Look up student in `data.json` via `fetchSourceData()`.
 *   2. Pull the OneRoster sourcedId from `dd.identity` (sourcedId / sourced_id /
 *      timeback_user_id). If none exists, return 503 — the front-end will
 *      gracefully fall back to the cached `dd.live_activity` from data.json.
 *   3. Hit the live Timeback edubridge analytics endpoint via
 *      `fetchLiveActivity` in `lib/dashboard/timeback.ts`.
 *
 * Caching:
 *   - Cognito token is cached in-process for ~50 minutes.
 *   - Per-request: NO caching, NO CDN. Headers force `private, no-store`.
 *
 * Error codes:
 *    401 unauthenticated
 *    403 out-of-scope or no DRI scope
 *    404 student not found in dashboard data
 *    422 student found but missing sourcedId
 *    503 Cognito creds missing OR upstream Timeback failure
 *    500 generic server error
 *
 * Logging contract:
 *   Never logs student names, emails, scores, picked answers, or full
 *   payloads. Only the DRI slug, an 8-char hash of the student slug, and
 *   the status. Matches the existing dashboard-data + feedback contract.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { scopeForEmail } from "@/lib/dri-scopes";
import { dashboardJson } from "@/lib/dashboard/headers";
import {
  fetchSourceData,
  isPending,
  isStudentInScope,
  type DashboardData,
} from "@/lib/dashboard/scopedData";
import {
  CognitoCredsMissingError,
  TimebackUpstreamError,
  fetchLiveActivity,
  type LiveActivityResult,
} from "@/lib/dashboard/timeback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 31;

function shortHash(input: string): string {
  return createHash("sha256").update(input.toLowerCase()).digest("hex").slice(0, 8);
}

interface StudentDdShape {
  identity?: {
    sourcedId?: string | null;
    sourced_id?: string | null;
    timeback_user_id?: string | null;
    student_id?: string | null;
  } | null;
  [k: string]: unknown;
}

/**
 * Pull the OneRoster sourcedId out of a student dd, accepting the three
 * spellings that have appeared in different snapshots.
 */
function sourcedIdFromDd(dd: StudentDdShape | null | undefined): string | null {
  if (!dd) return null;
  const ident = dd.identity ?? null;
  if (!ident) return null;
  const candidate =
    ident.sourcedId || ident.sourced_id || ident.timeback_user_id || ident.student_id || null;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function findDdForSlug(data: DashboardData, slug: string): StudentDdShape | null {
  const dds = data.student_dds;
  if (!dds || typeof dds !== "object") return null;
  const direct = (dds as Record<string, unknown>)[slug];
  if (direct && typeof direct === "object") return direct as StudentDdShape;
  const lower = slug.toLowerCase();
  for (const [k, v] of Object.entries(dds as Record<string, unknown>)) {
    if (k.toLowerCase() === lower && v && typeof v === "object") {
      return v as StudentDdShape;
    }
  }
  return null;
}

interface LiveActivityResponse {
  ok: true;
  pulled_at: string;
  student: string;
  days: number;
  data: LiveActivityResult;
}

interface ErrorResponse {
  ok: false;
  error: string;
  reason?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return dashboardJson<ErrorResponse>({ ok: false, error: "Unauthorized" }, 401);
  }
  const scope = scopeForEmail(email);
  if (!scope) {
    return dashboardJson<ErrorResponse>({ ok: false, error: "Forbidden" }, 403);
  }

  const slug = req.nextUrl.searchParams.get("student");
  if (!slug || slug.length < 1 || slug.length > 200) {
    return dashboardJson<ErrorResponse>(
      { ok: false, error: "Missing or invalid `student` query parameter" },
      400
    );
  }
  const daysRaw = req.nextUrl.searchParams.get("days");
  const daysParsed = daysRaw ? Number.parseInt(daysRaw, 10) : DEFAULT_DAYS;
  if (!Number.isFinite(daysParsed) || daysParsed < 1 || daysParsed > MAX_DAYS) {
    return dashboardJson<ErrorResponse>(
      { ok: false, error: `Invalid days; must be 1..${MAX_DAYS}` },
      400
    );
  }

  // Scope check + identity lookup happen against the same envelope so we
  // pay only one Blob fetch per request.
  let envelope: DashboardData;
  try {
    const fetched = await fetchSourceData();
    if (isPending(fetched)) {
      console.warn(
        `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} status=data_pending`
      );
      return dashboardJson<ErrorResponse>(
        { ok: false, error: "Dashboard data not yet uploaded" },
        503
      );
    }
    envelope = fetched;
  } catch {
    console.error(
      `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} status=data_fetch_failed`
    );
    return dashboardJson<ErrorResponse>({ ok: false, error: "Internal server error" }, 500);
  }

  if (!isStudentInScope(envelope, scope, slug)) {
    console.warn(
      `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} status=out_of_scope`
    );
    return dashboardJson<ErrorResponse>({ ok: false, error: "Forbidden" }, 403);
  }

  const dd = findDdForSlug(envelope, slug);
  if (!dd) {
    console.warn(
      `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} status=not_found`
    );
    return dashboardJson<ErrorResponse>({ ok: false, error: "Student not found" }, 404);
  }

  const sourcedId = sourcedIdFromDd(dd);
  if (!sourcedId) {
    console.warn(
      `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} status=missing_sourced_id`
    );
    return dashboardJson<ErrorResponse>(
      {
        ok: false,
        error: "Live data unavailable for this student",
        reason: "missing_sourced_id",
      },
      422
    );
  }

  try {
    const data = await fetchLiveActivity(sourcedId, daysParsed);
    console.log(
      `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} days=${daysParsed} status=ok`
    );
    return dashboardJson<LiveActivityResponse>(
      {
        ok: true,
        pulled_at: data.pulled_at,
        student: slug,
        days: daysParsed,
        data,
      },
      200
    );
  } catch (err: unknown) {
    if (err instanceof CognitoCredsMissingError) {
      console.warn(
        `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} status=creds_missing`
      );
      return dashboardJson<ErrorResponse>(
        {
          ok: false,
          error: "Live data integration not configured",
          reason: "cognito_creds_missing",
        },
        503
      );
    }
    if (err instanceof TimebackUpstreamError) {
      console.error(
        `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} status=upstream_failed code=${err.status ?? "unknown"}`
      );
      return dashboardJson<ErrorResponse>(
        { ok: false, error: "Upstream Timeback fetch failed", reason: "upstream_error" },
        503
      );
    }
    const code = err instanceof Error ? err.name : "unknown";
    console.error(
      `pull_live_activity scope=${scope.dri} student_hash=${shortHash(slug)} status=error code=${code}`
    );
    return dashboardJson<ErrorResponse>({ ok: false, error: "Internal server error" }, 500);
  }
}
