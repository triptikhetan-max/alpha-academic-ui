/**
 * Renders the daily digest email for a Brain-dashboard DRI.
 *
 * Sent by the cron at `app/api/cron/dashboard-digest/route.ts` once a
 * day at 11:00 UTC (≈ 5/6am CT depending on DST) when ≥ 3 critical
 * flags have appeared overnight inside the DRI's scope. The diff is
 * computed against yesterday's snapshot in Vercel Blob (Agent B).
 */
import type { DriScope } from "@/lib/dri-scopes";

export type FlagCategory =
  | "doom_loop"
  | "policy"
  | "coaching_gap"
  | "engagement"
  | "pick"
  | "subject_flag";

export type FlagSeverity = "critical" | "warn" | "info";

export interface NewFlag {
  kid_slug: string;
  kid_name: string;
  category: FlagCategory;
  severity: FlagSeverity;
  description: string;
}

export interface RenderedDigestEmail {
  subject: string;
  text: string;
  html: string;
}

const MAX_ITEMS_IN_BODY = 10;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(
  scope: DriScope,
  items: NewFlag[],
  criticalCount: number,
  dashboardOrigin: string
): string {
  const firstName = scope.name.split(" ")[0];
  const url = `${dashboardOrigin}${scope.landing}`;
  const rows = items
    .slice(0, MAX_ITEMS_IN_BODY)
    .map(
      (i) => `
    <li style="margin: 4px 0;">
      <strong>${escapeHtml(i.kid_name)}</strong>
      · <code>${escapeHtml(i.category)}</code>
      · ${escapeHtml(i.description)}
    </li>`
    )
    .join("");

  const overflowNote =
    items.length > MAX_ITEMS_IN_BODY
      ? `<p style="font-size: 13px; color: #57534e;">+ ${
          items.length - MAX_ITEMS_IN_BODY
        } more in the dashboard.</p>`
      : "";

  const pluralS = criticalCount === 1 ? "" : "s";

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #1c1917; line-height: 1.6;">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>${criticalCount} new critical flag${pluralS} appeared overnight in your scope.</p>
  <ul style="padding-left: 22px;">${rows}
  </ul>
  ${overflowNote}
  <p>
    Open the dashboard:
    <a href="${escapeHtml(url)}" style="color: #0891b2;">${escapeHtml(url)}</a>
  </p>
  <p style="font-size: 12px; color: #a8a29e; margin-top: 24px;">
    — Brain dashboard auto-digest
  </p>
</div>
  `.trim();
}

export function renderDailyDigest(
  scope: DriScope,
  items: NewFlag[],
  dashboardOrigin: string
): RenderedDigestEmail {
  const firstName = scope.name.split(" ")[0];
  const critical = items.filter((i) => i.severity === "critical");
  const pluralS = critical.length === 1 ? "" : "s";

  const subject = `Brain dashboard — ${critical.length} new critical flag${pluralS} for ${scope.name}`;

  const lines: string[] = [
    `Hi ${firstName},`,
    ``,
    `${critical.length} new critical flag${pluralS} appeared overnight in your scope.`,
    ``,
    ...items
      .slice(0, MAX_ITEMS_IN_BODY)
      .map((i) => `- ${i.kid_name} · ${i.category} · ${i.description}`),
  ];

  if (items.length > MAX_ITEMS_IN_BODY) {
    lines.push(`+ ${items.length - MAX_ITEMS_IN_BODY} more in the dashboard.`);
  }

  lines.push(
    ``,
    `Open the dashboard:`,
    `  ${dashboardOrigin}${scope.landing}`,
    ``,
    `— Brain dashboard auto-digest`
  );

  const text = lines.join("\n");
  const html = renderHtml(scope, items, critical.length, dashboardOrigin);

  return { subject, text, html };
}
