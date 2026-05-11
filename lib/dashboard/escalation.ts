/**
 * Escalation routing — Campus DRI → Subject DRI.
 *
 * The Brain Dashboard role model has NO Subject DRI dashboard view. Campus
 * DRIs handle every kid in their scope and ESCALATE to the Subject DRI when
 * subject-matter expertise is needed. This module is the single source of
 * truth for "given a flagged subject + grade, who is the Subject DRI we
 * should email?".
 *
 * Resolution order:
 *   1. Per-kid override from the kid's DD enrichment
 *      (`brain_enrichment.subject_dri_lookup`) — if present and shaped as
 *      `{ subject: { email, name } }`, prefer it.
 *   2. Hardcoded fallback map keyed by `(subject, grade-band)`.
 *
 * Returning `null` means we could NOT resolve — the API caller should reject
 * with a 400 and ask the Campus DRI to pick the recipient manually.
 */
import { sendEmail } from "@/lib/mailer";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface SubjectDri {
  email: string;
  name: string;
}

export interface SubjectDriLookupCandidate {
  /** Raw value (likely `unknown`) lifted from `dd.brain_enrichment.subject_dri_lookup`. */
  raw: unknown;
}

export interface SendEscalationEmailParams {
  fromDri: { email: string; name: string };
  toDri: SubjectDri;
  kidName: string;
  kidSlug: string;
  subject: string;
  grade: number | null;
  note?: string;
  /** Short evidence summary — never include AI narrative or scores. */
  evidence?: string;
  eventId: string;
  /** Absolute base URL for the dashboard, e.g. https://… */
  dashboardBaseUrl: string;
}

/* ------------------------------------------------------------------ */
/* Hardcoded fallback table                                           */
/* ------------------------------------------------------------------ */

interface FallbackRule {
  subjectMatchers: string[]; // case-insensitive substrings to match against subject label
  minGrade: number; // inclusive (use -1 for "no lower bound")
  maxGrade: number; // inclusive (use 99 for "no upper bound")
  email: string;
  name: string;
}

/**
 * NOTE: names are best-effort display strings — emails are the source of
 * truth. We deliberately keep the surface tiny so it stays auditable.
 */
const SUBJECT_DRI_FALLBACK: FallbackRule[] = [
  // Math
  {
    subjectMatchers: ["math"],
    minGrade: 0,
    maxGrade: 2,
    email: "vijaykumar.kartha@alpha.school",
    name: "Vijaykumar Kartha",
  },
  {
    subjectMatchers: ["math"],
    minGrade: 3,
    maxGrade: 6,
    email: "julian.hernandez@alpha.school",
    name: "Julian Hernandez",
  },
  {
    subjectMatchers: ["math"],
    minGrade: 7,
    maxGrade: 8,
    email: "ruchi.baid@alpha.school",
    name: "Ruchi Baid",
  },
  // Reading
  {
    subjectMatchers: ["reading"],
    minGrade: 0,
    maxGrade: 2,
    email: "barbara.franks@alpha.school",
    name: "Barbara Franks",
  },
  {
    subjectMatchers: ["reading"],
    minGrade: 3,
    maxGrade: 8,
    email: "aleksandra.wrega@alpha.school",
    name: "Aleksandra Wrega",
  },
  {
    subjectMatchers: ["reading"],
    minGrade: 9,
    maxGrade: 12,
    email: "ben.piper@alpha.school",
    name: "Ben Piper",
  },
  // Language
  {
    subjectMatchers: ["language"],
    minGrade: 0,
    maxGrade: 2,
    email: "nick.alsford@alpha.school",
    name: "Nick Alsford",
  },
  {
    subjectMatchers: ["language"],
    minGrade: 3,
    maxGrade: 12,
    email: "barbara.franks@alpha.school",
    name: "Barbara Franks",
  },
  // Writing
  {
    subjectMatchers: ["writing"],
    minGrade: 3,
    maxGrade: 12,
    email: "noel.pilkington@alpha.school",
    name: "Noel Pilkington",
  },
  // Vocabulary
  {
    subjectMatchers: ["vocabulary", "vocab"],
    minGrade: -1,
    maxGrade: 99,
    email: "barbara.franks@alpha.school",
    name: "Barbara Franks",
  },
  // Science
  {
    subjectMatchers: ["science"],
    minGrade: 0,
    maxGrade: 8,
    email: "david.babagbale@alpha.school",
    name: "David Babagbale",
  },
  // Social Studies
  {
    subjectMatchers: ["social"],
    minGrade: 0,
    maxGrade: 8,
    email: "bill.brooks@alpha.school",
    name: "Bill Brooks",
  },
  // FastMath
  {
    subjectMatchers: ["fastmath", "fast math"],
    minGrade: -1,
    maxGrade: 99,
    email: "janna.peskett@alpha.school",
    name: "Janna Peskett",
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Read a per-kid override out of an unknown-shaped lookup blob. */
function readSubjectOverride(
  lookup: unknown,
  subject: string
): SubjectDri | null {
  if (!lookup || typeof lookup !== "object") return null;
  const map = lookup as Record<string, unknown>;
  const subjectKey = Object.keys(map).find(
    (k) => k.toLowerCase() === subject.toLowerCase()
  );
  if (!subjectKey) return null;
  const value = map[subjectKey];
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const email = typeof v.email === "string" ? v.email : null;
  const name = typeof v.name === "string" ? v.name : email;
  if (!email) return null;
  return { email, name: name ?? email };
}

/** Match a fallback rule by subject substring + grade band. */
function matchFallback(subject: string, grade: number | null): SubjectDri | null {
  const subj = (subject || "").toLowerCase();
  for (const rule of SUBJECT_DRI_FALLBACK) {
    const subjectMatch = rule.subjectMatchers.some((m) => subj.includes(m));
    if (!subjectMatch) continue;
    if (grade === null) {
      // No grade — pick the broadest rule for this subject (first match wins).
      return { email: rule.email, name: rule.name };
    }
    if (grade >= rule.minGrade && grade <= rule.maxGrade) {
      return { email: rule.email, name: rule.name };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolve the Subject DRI to escalate to.
 *
 * @param subject       Flagged subject label (e.g. "Math", "Reading")
 * @param grade         Numeric grade (0..12) or null when unknown
 * @param subjectLookup Optional per-kid override blob from DD enrichment
 */
export function resolveSubjectDri(
  subject: string,
  grade: number | null,
  subjectLookup?: unknown
): SubjectDri | null {
  if (!subject) return null;
  const override = readSubjectOverride(subjectLookup, subject);
  if (override) return override;
  return matchFallback(subject, grade);
}

/**
 * Send the escalation email. Fire-and-forget from the caller's perspective —
 * if SMTP isn't configured we log a warning and return false; if the send
 * itself fails we log the error code (no PII) and return false. The caller
 * should persist the escalation event regardless of mail success.
 */
export async function sendEscalationEmail(
  params: SendEscalationEmailParams
): Promise<boolean> {
  const {
    fromDri,
    toDri,
    kidName,
    kidSlug,
    subject,
    grade,
    note,
    evidence,
    eventId,
    dashboardBaseUrl,
  } = params;

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn(
      `escalation mail_skipped reason=missing_smtp_creds eventId=${eventId}`
    );
    return false;
  }

  const profileUrl = `${dashboardBaseUrl.replace(/\/$/, "")}/dashboard#/student/${encodeURIComponent(
    kidSlug
  )}`;
  const gradeLabel = grade === null ? "—" : String(grade);

  const subjectLine = `[Brain Dashboard] Escalation: ${kidName} · ${subject}`;
  const text = [
    `Hi ${toDri.name},`,
    ``,
    `${fromDri.name} (Campus DRI) has escalated a student to you.`,
    ``,
    `Student: ${kidName}`,
    `Subject: ${subject}`,
    `Grade: ${gradeLabel}`,
    note ? `Note from Campus DRI:\n${note}` : null,
    evidence ? `Evidence:\n${evidence}` : null,
    ``,
    `View on dashboard: ${profileUrl}`,
    ``,
    `— Brain Dashboard`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = renderEscalationHtml({
    fromName: fromDri.name,
    toName: toDri.name,
    kidName,
    subject,
    gradeLabel,
    note,
    evidence,
    profileUrl,
  });

  try {
    await sendEmail({
      to: toDri.email,
      cc: fromDri.email,
      subject: subjectLine,
      text,
      html,
    });
    return true;
  } catch (err: unknown) {
    const code = err instanceof Error ? err.name : "unknown";
    console.error(`escalation mail_send_failed code=${code} eventId=${eventId}`);
    return false;
  }
}

interface EscalationHtmlParams {
  fromName: string;
  toName: string;
  kidName: string;
  subject: string;
  gradeLabel: string;
  note?: string;
  evidence?: string;
  profileUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEscalationHtml(p: EscalationHtmlParams): string {
  const noteBlock = p.note
    ? `<p style="margin:0 0 12px;"><strong>Note from Campus DRI:</strong><br/>${escapeHtml(
        p.note
      )}</p>`
    : "";
  const evidenceBlock = p.evidence
    ? `<p style="margin:0 0 12px;"><strong>Evidence:</strong><br/>${escapeHtml(
        p.evidence
      )}</p>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
    <h1 style="font-size:18px;margin:0 0 16px;">Escalation: ${escapeHtml(p.kidName)}</h1>
    <p style="margin:0 0 12px;">Hi ${escapeHtml(p.toName)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(
      p.fromName
    )} (Campus DRI) has escalated a student to you.</p>
    <table style="border-collapse:collapse;margin:0 0 12px;font-size:14px;">
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Student</td><td style="padding:2px 0;">${escapeHtml(
        p.kidName
      )}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Subject</td><td style="padding:2px 0;">${escapeHtml(
        p.subject
      )}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Grade</td><td style="padding:2px 0;">${escapeHtml(
        p.gradeLabel
      )}</td></tr>
    </table>
    ${noteBlock}
    ${evidenceBlock}
    <p style="margin:16px 0 0;">
      <a href="${p.profileUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">View on dashboard</a>
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">— Brain Dashboard</p>
  </div>
</body></html>`;
}
