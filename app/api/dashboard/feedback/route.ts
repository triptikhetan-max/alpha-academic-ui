/**
 * POST /api/dashboard/feedback
 *
 * Records dashboard flag feedback as append-only durable events.
 * Replaces the legacy `mailto` + `localStorage` flow inside render.js.
 *
 * Security boundary:
 *   - Requires a valid NextAuth session (401 otherwise)
 *   - Resolves DRI scope server-side from session.email (403 if no scope)
 *   - Verifies the feedback target studentId is in the caller's scope (403 if not)
 *   - Validates JSON body with zod (400 on invalid)
 *   - Stores one private Blob per event (no public access, no client-readable URL)
 *
 * Storage: Vercel Blob, private access, one JSON file per event.
 *   path: dashboard/feedback/YYYY-MM-DD/<createdAt-safe>_<eventId>.json
 *
 * Logging: only `eventId`, scope key, and a hash of the user email.
 * Never log: student names, emails, scores, picked answers, AI narratives,
 * full payloads, or note contents.
 */
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { scopeForEmail } from "@/lib/dri-scopes";
import { dashboardJson } from "@/lib/dashboard/headers";
import {
  fetchSourceData,
  isPending,
  isStudentInScope,
} from "@/lib/dashboard/scopedData";
import {
  flattenLatestEvents,
  loadFeedbackOverlay,
} from "@/lib/dashboard/feedbackOverlay";
import {
  resolveSubjectDri,
  sendEscalationEmail,
  type SubjectDri,
} from "@/lib/dashboard/escalation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DashboardFeedbackRequestSchema = z
  .object({
    studentId: z.string().min(1).max(200),
    flagId: z.string().min(1).max(300).optional(),
    sectionId: z.string().min(1).max(300).optional(),
    action: z.enum([
      "acknowledge",
      "in_progress",
      "resolved",
      "incorrect",
      "note",
      "escalated",
    ]),
    note: z.string().max(2000).optional(),
    campus: z.string().max(200).optional(),
    subject: z.string().max(200).optional(),
    sourceView: z.string().max(200).optional(),
    currentRefreshId: z.string().max(200).optional(),
    dataVersion: z.string().max(200).optional(),
    /** Escalation-only: explicit Subject DRI email to route to. */
    escalateTo: z.string().email().optional(),
    /** Escalation-only: target role (Subject DRI most commonly, but also admin/operator). */
    escalateToRole: z
      .enum(["subject_dri", "admin", "operator", "manager_readonly"])
      .optional(),
    /** Escalation-only: numeric grade band hint for routing (0..12). */
    grade: z.number().int().min(-1).max(12).optional(),
  })
  .refine((value) => value.flagId || value.sectionId, {
    message: "Either flagId or sectionId is required",
  });

type DashboardFeedbackRequest = z.infer<typeof DashboardFeedbackRequestSchema>;

interface DashboardFeedbackEvent extends DashboardFeedbackRequest {
  eventId: string;
  createdAt: string;
  userEmail: string;
  userScopeSnapshot: {
    dri: string;
    role: string;
    campuses: string[];
    levels: string[];
  };
  appSurface: "dashboard";
  storageVersion: 1;
  /** Resolved Subject DRI for `action: "escalated"` events. */
  escalatedToResolved?: { email: string; name: string };
  /** Whether the escalation email actually went out. */
  escalationMailSent?: boolean;
}

function emailHash(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12);
}

function createdAtSafe(iso: string): string {
  // 2026-04-29T18:20:31.120Z -> 2026-04-29T18-20-31-120Z
  return iso.replace(/[:.]/g, "-");
}

function dateBucket(iso: string): string {
  // 2026-04-29T18:20:31.120Z -> 2026-04-29
  return iso.slice(0, 10);
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return dashboardJson({ ok: false, error: "Unauthorized" }, 401);
  }

  const scope = scopeForEmail(email);
  if (!scope) {
    console.warn(
      `dashboard-feedback unauthorized email_hash=${emailHash(email)}`
    );
    return dashboardJson({ ok: false, error: "Forbidden" }, 403);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return dashboardJson(
      { ok: false, error: "Invalid JSON body" },
      400
    );
  }

  const parsed = DashboardFeedbackRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return dashboardJson(
      { ok: false, error: "Invalid feedback payload" },
      400
    );
  }
  const body = parsed.data;

  // Authorization: confirm the target student is in the caller's scope.
  // TODO(flag-level): for now we only verify student-level scope. When the
  // data envelope exposes a stable flag index, also confirm `flagId` belongs
  // to this student/section.
  try {
    const data = await fetchSourceData();
    if (isPending(data)) {
      // Without source data we cannot verify scope — fail closed.
      console.error(
        `dashboard-feedback scope_check_unavailable scope=${scope.dri}`
      );
      return dashboardJson(
        { ok: false, error: "Could not save feedback" },
        500
      );
    }
    if (!isStudentInScope(data, scope, body.studentId)) {
      console.warn(
        `dashboard-feedback out_of_scope scope=${scope.dri}`
      );
      return dashboardJson({ ok: false, error: "Forbidden" }, 403);
    }
  } catch (err: unknown) {
    const code = err instanceof Error ? err.name : "unknown";
    console.error(`dashboard-feedback scope_check_failed code=${code}`);
    return dashboardJson(
      { ok: false, error: "Could not save feedback" },
      500
    );
  }

  const eventId = randomUUID();
  const createdAt = new Date().toISOString();

  // Resolve escalation target BEFORE persisting so we can fail-closed when
  // the Campus DRI's escalation can't be routed anywhere.
  let resolvedEscalation: SubjectDri | null = null;
  if (body.action === "escalated") {
    if (body.escalateTo) {
      resolvedEscalation = { email: body.escalateTo, name: body.escalateTo };
    } else if (body.subject) {
      resolvedEscalation = resolveSubjectDri(
        body.subject,
        typeof body.grade === "number" ? body.grade : null
      );
    }
    if (!resolvedEscalation) {
      console.warn(
        `dashboard-feedback escalation_unresolved scope=${scope.dri}`
      );
      return dashboardJson(
        {
          ok: false,
          error: "Could not determine escalation target",
        },
        400
      );
    }
  }

  const event: DashboardFeedbackEvent = {
    ...body,
    eventId,
    createdAt,
    userEmail: email,
    userScopeSnapshot: {
      dri: scope.dri,
      role: scope.role,
      campuses: [...scope.campuses],
      levels: [...scope.levels],
    },
    appSurface: "dashboard",
    storageVersion: 1,
    ...(resolvedEscalation
      ? { escalatedToResolved: resolvedEscalation }
      : {}),
  };

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("dashboard-feedback missing_blob_token");
    return dashboardJson(
      { ok: false, error: "Could not save feedback" },
      500
    );
  }

  const pathname = `dashboard/feedback/${dateBucket(createdAt)}/${createdAtSafe(
    createdAt
  )}_${eventId}.json`;

  try {
    await put(pathname, JSON.stringify(event), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      token,
    });
  } catch (err: unknown) {
    const code = err instanceof Error ? err.name : "unknown";
    console.error(
      `dashboard-feedback blob_write_failed code=${code} eventId=${eventId}`
    );
    return dashboardJson(
      { ok: false, error: "Could not save feedback" },
      500
    );
  }

  console.log(
    `dashboard-feedback saved scope=${scope.dri} action=${body.action} eventId=${eventId}`
  );

  // Fire-and-forget escalation email (event is already persisted at this point).
  if (body.action === "escalated" && resolvedEscalation) {
    const baseUrl =
      process.env.DASHBOARD_BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "https://alphaacademicui.vercel.app";
    const driSlug = resolvedEscalation.email
      .split("@")[0]
      .replace(/[^a-z0-9._-]/gi, "");
    console.log(
      `escalation eventId=${eventId} from=${emailHash(email)} to=${driSlug} subject=${
        body.subject || "_none"
      }`
    );
    try {
      const sent = await sendEscalationEmail({
        fromDri: { email, name: scope.name ?? scope.dri },
        toDri: resolvedEscalation,
        kidName: body.studentId,
        kidSlug: body.studentId,
        subject: body.subject || "(unspecified)",
        grade: typeof body.grade === "number" ? body.grade : null,
        note: body.note,
        eventId,
        dashboardBaseUrl: baseUrl,
      });
      if (!sent) {
        console.warn(`escalation mail_unsent eventId=${eventId}`);
      }
    } catch (err: unknown) {
      const code = err instanceof Error ? err.name : "unknown";
      console.error(
        `escalation mail_threw code=${code} eventId=${eventId}`
      );
    }
    return dashboardJson(
      {
        ok: true,
        eventId,
        escalatedTo: resolvedEscalation.email,
        escalatedToName: resolvedEscalation.name,
      },
      200
    );
  }

  return dashboardJson({ ok: true, eventId }, 200);
}

/**
 * GET /api/dashboard/feedback?since=YYYY-MM-DDTHH:mm:ssZ
 *
 * Returns the latest-per-(studentId, flagId) feedback events visible to the
 * caller. Filtered server-side to the caller's scope, sorted newest first.
 *
 * Used by client-side overlays that want to refresh lifecycle badges
 * without a full page reload (e.g. after the user acks a card).
 */
const ISO_SINCE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return dashboardJson({ ok: false, error: "Unauthorized" }, 401);
  }

  const scope = scopeForEmail(email);
  if (!scope) {
    console.warn(
      `dashboard-feedback-get unauthorized email_hash=${emailHash(email)}`
    );
    return dashboardJson({ ok: false, error: "Forbidden" }, 403);
  }

  let sinceIso: string | undefined;
  try {
    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    if (since) {
      if (!ISO_SINCE_RE.test(since)) {
        return dashboardJson(
          { ok: false, error: "Invalid since parameter" },
          400
        );
      }
      sinceIso = since;
    }
  } catch {
    // Ignore — fall through with no `since`.
  }

  try {
    const overlay = await loadFeedbackOverlay(scope, { sinceIso });
    const events = flattenLatestEvents(overlay);
    console.log(
      `dashboard-feedback-get scope=${scope.dri} count=${events.length}`
    );
    return dashboardJson(
      {
        ok: true,
        events,
        resolvedThisWeek: overlay.resolvedThisWeek,
        available: overlay.available,
      },
      200
    );
  } catch (err: unknown) {
    const code = err instanceof Error ? err.name : "unknown";
    console.error(`dashboard-feedback-get internal_error code=${code}`);
    return dashboardJson(
      { ok: false, error: "Could not load feedback" },
      500
    );
  }
}
