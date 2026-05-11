/**
 * GET /api/cron/dashboard-digest
 *
 * Vercel Cron entrypoint — invoked daily at 11:00 UTC (≈ 5/6am CT).
 * Validates `Authorization: Bearer ${CRON_SECRET}`. Iterates the
 * configured DRI scopes, diffs today's vs yesterday's snapshots
 * (Vercel Blob — Agent B's territory), and sends a digest to any
 * DRI whose new-critical count crosses the threshold.
 *
 * STUB: until Blob versioning lands, the diff returns an empty list
 * for every DRI. Pass `?test=1` to send a digest with mock items so
 * the wiring (auth → mailer → DRI map) can be smoke-tested end-to-end.
 */
import { NextResponse } from "next/server";
import { DRI_SCOPES, type DriScope } from "@/lib/dri-scopes";
import { sendEmail } from "@/lib/mailer";
import {
  renderDailyDigest,
  type NewFlag,
} from "@/lib/emails/dashboard-daily-digest";

const ADMIN_CC = process.env.ADMIN_CC ?? "tripti.khetan@trilogy.com";
const DEFAULT_DASHBOARD_ORIGIN =
  process.env.DASHBOARD_ORIGIN ?? "https://alpha-academic-ui.vercel.app";
const CRITICAL_THRESHOLD = 3;

interface SentReport {
  dri: string;
  email: string;
  critical_count: number;
  message_id?: string;
  error?: string;
}

/**
 * STUB: real implementation reads today's + yesterday's blob snapshots
 * for `scope.dri` and returns the new-flag diff. For now we return an
 * empty array so production cron runs are a no-op until Agent B is live.
 */
async function loadNewFlagsForScope(_scope: DriScope): Promise<NewFlag[]> {
  return [];
}

function buildMockFlags(scope: DriScope): NewFlag[] {
  const campus = scope.campuses[0] ?? "BTX";
  return [
    {
      kid_slug: `${scope.dri}-mock-1`,
      kid_name: `${campus} · Test Kid A`,
      category: "doom_loop",
      severity: "critical",
      description: "3 consecutive failed attempts on Math 6 (mock).",
    },
    {
      kid_slug: `${scope.dri}-mock-2`,
      kid_name: `${campus} · Test Kid B`,
      category: "policy",
      severity: "critical",
      description: "Time-on-task < 30 min for 5 days (mock).",
    },
    {
      kid_slug: `${scope.dri}-mock-3`,
      kid_name: `${campus} · Test Kid C`,
      category: "coaching_gap",
      severity: "critical",
      description: "No 1:1 logged in 14 days (mock).",
    },
  ];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const isTest = url.searchParams.get("test") === "1";

  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      {
        error:
          "Mailer not configured — set GMAIL_USER and GMAIL_APP_PASSWORD env vars.",
      },
      { status: 500 }
    );
  }

  const sent: SentReport[] = [];

  for (const scope of Object.values(DRI_SCOPES)) {
    // Skip the master DRI for the daily digest — Tripti gets the BCC stream.
    if (scope.campuses.length === 0 && scope.levels.length === 0) {
      continue;
    }

    const items = isTest
      ? buildMockFlags(scope)
      : await loadNewFlagsForScope(scope);
    const criticalCount = items.filter((i) => i.severity === "critical").length;

    if (criticalCount < CRITICAL_THRESHOLD) {
      continue;
    }

    const { subject, text, html } = renderDailyDigest(
      scope,
      items,
      DEFAULT_DASHBOARD_ORIGIN
    );

    try {
      const info = await sendEmail({
        to: scope.email,
        cc: scope.manager_email,
        bcc: ADMIN_CC,
        subject,
        text,
        html,
      });
      sent.push({
        dri: scope.dri,
        email: scope.email,
        critical_count: criticalCount,
        message_id: info.messageId,
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      sent.push({
        dri: scope.dri,
        email: scope.email,
        critical_count: criticalCount,
        error: [err.code, err.message].filter(Boolean).join(" — "),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mode: isTest ? "test" : "live",
    threshold: CRITICAL_THRESHOLD,
    sent,
  });
}
