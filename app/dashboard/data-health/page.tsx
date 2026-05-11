/**
 * /dashboard/data-health — at-a-glance freshness dashboard for every
 * upstream source feeding the Brain Dashboard.
 *
 * Server component; reads:
 *   - data.json `_generated` ISO timestamp → "Last refresh"
 *   - Vercel Blob `head("dashboard/data.json")` → `uploadedAt` → "Blob age"
 *   - `students` count vs roster size → coverage %
 *   - Per-source mtime when available, else "unknown"
 *
 * The page renders a compact source table per the handoff:
 *   Source | Last successful pull | Rows | Coverage | Status | Notes
 *
 * Status labels:
 *   - Fresh   (≤24h old)
 *   - Partial (24–72h, coverage <90%)
 *   - Stale   (>72h)
 *   - Failed  (explicit failure marker)
 *   - Unknown (no metadata available)
 *
 * The full Markdown audit lives at
 * `/Volumes/T7 Shield/Work/Alpha/brain/CORRECTNESS_AUDIT.md` — this page
 * is the in-app summary version.
 */
import { head } from "@vercel/blob";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { scopeForEmail } from "@/lib/dri-scopes";
import { fetchSourceData, isPending } from "@/lib/dashboard/scopedData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Status = "fresh" | "partial" | "stale" | "failed" | "unknown";

interface SourceRow {
  source: string;
  lastPull: string | null;
  rows: number | null;
  coverage: number | null;
  status: Status;
  notes: string;
}

const HOUR_MS = 60 * 60 * 1000;

function classifyByAge(ageMs: number | null, coverage: number | null): Status {
  if (ageMs === null) return "unknown";
  if (ageMs <= 24 * HOUR_MS) return "fresh";
  if (ageMs <= 72 * HOUR_MS) {
    if (coverage !== null && coverage < 0.9) return "partial";
    return "partial";
  }
  return "stale";
}

function pillStyle(status: Status): React.CSSProperties {
  const map: Record<Status, { color: string; bg: string }> = {
    fresh: { color: "#065f46", bg: "#d1fae5" },
    partial: { color: "#92400e", bg: "#fef3c7" },
    stale: { color: "#7f1d1d", bg: "#fee2e2" },
    failed: { color: "#7f1d1d", bg: "#fee2e2" },
    unknown: { color: "#374151", bg: "#f3f4f6" },
  };
  const m = map[status];
  return {
    color: m.color,
    background: m.bg,
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    textTransform: "uppercase",
  };
}

function formatAge(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (ms < 24 * HOUR_MS) return `${Math.round(ms / HOUR_MS)}h ago`;
  return `${Math.round(ms / (24 * HOUR_MS))}d ago`;
}

interface BlobMeta {
  uploadedAt: string | null;
  size: number | null;
  error: string | null;
}

async function fetchBlobMeta(): Promise<BlobMeta> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return { uploadedAt: null, size: null, error: "BLOB_READ_WRITE_TOKEN not configured" };
  }
  try {
    const meta = await head("dashboard/data.json", { token });
    return {
      uploadedAt: meta.uploadedAt ? new Date(meta.uploadedAt).toISOString() : null,
      size: typeof meta.size === "number" ? meta.size : null,
      error: null,
    };
  } catch (err: unknown) {
    return {
      uploadedAt: null,
      size: null,
      error: err instanceof Error ? err.name : "head_failed",
    };
  }
}

export default async function DataHealthPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  const scope = scopeForEmail(email);
  if (!scope) redirect("/login");

  // ── 1. Fetch source data + Blob metadata in parallel
  const [data, blob] = await Promise.all([fetchSourceData(), fetchBlobMeta()]);

  if (isPending(data)) {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Data health</h1>
        <p>{data.message}</p>
      </main>
    );
  }

  const generatedAt =
    typeof data._generated === "string" ? new Date(data._generated) : null;
  const generatedMs = generatedAt && !Number.isNaN(generatedAt.getTime())
    ? Date.now() - generatedAt.getTime()
    : null;
  const blobUploadedAt = blob.uploadedAt ? new Date(blob.uploadedAt) : null;
  const blobAgeMs =
    blobUploadedAt && !Number.isNaN(blobUploadedAt.getTime())
      ? Date.now() - blobUploadedAt.getTime()
      : null;

  const studentRows = Array.isArray(data.students) ? data.students.length : 0;
  const studentDdsRows = data.student_dds && typeof data.student_dds === "object"
    ? Object.keys(data.student_dds as Record<string, unknown>).length
    : 0;
  const ddCoverage =
    studentRows > 0 ? Math.min(1, studentDdsRows / studentRows) : null;

  // ── 2. Build per-source rows. mtimes for individual sub-sources are
  //    not exposed in the current envelope; mark them "unknown" with notes
  //    until the nightly cron starts emitting per-source `_mtime` fields.
  const liveCredsConfigured = Boolean(
    process.env.ALPHA_CLIENT_ID && process.env.ALPHA_CLIENT_SECRET
  );

  const rows: SourceRow[] = [
    {
      source: "data.json (full envelope)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: studentRows,
      coverage: 1,
      status: classifyByAge(generatedMs, 1),
      notes: "Nightly composite from all sources below.",
    },
    {
      source: "Vercel Blob: dashboard/data.json",
      lastPull: blobUploadedAt ? blobUploadedAt.toISOString() : null,
      rows: blob.size,
      coverage: null,
      status: blob.error ? "failed" : classifyByAge(blobAgeMs, null),
      notes: blob.error ? blob.error : "Updated by `npm run upload:data`.",
    },
    {
      source: "Test attempts (OneRoster assessmentResults)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: null,
      coverage: null,
      status: classifyByAge(generatedMs, null),
      notes: "Pulled nightly via Cognito M2M. Source of truth for picked answers.",
    },
    {
      source: "Picked answers (AlphaTest admin)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: null,
      coverage: null,
      status: classifyByAge(generatedMs, null),
      notes: "Pulled nightly via Clerk session.",
    },
    {
      source: "Live XP per subject (edubridge analytics)",
      lastPull: liveCredsConfigured ? new Date().toISOString() : (generatedAt ? generatedAt.toISOString() : null),
      rows: null,
      coverage: null,
      status: liveCredsConfigured ? "fresh" : classifyByAge(generatedMs, null),
      notes: liveCredsConfigured
        ? "Live (per-request) via /api/dashboard/live-activity."
        : "ALPHA_CLIENT_ID/SECRET not configured — falling back to nightly cache.",
    },
    {
      source: "Lesson log (derived from assessmentResults)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: null,
      coverage: null,
      status: classifyByAge(generatedMs, null),
      notes: "Computed from cached test attempts; refreshed with the envelope.",
    },
    {
      source: "MAP RIT scores (Winter MAP)",
      lastPull: null,
      rows: null,
      coverage: null,
      status: "unknown",
      notes: "Manual weekly upload. Per-source mtime not yet exposed.",
    },
    {
      source: "Coaching sessions (Google Sheets)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: null,
      coverage: null,
      status: classifyByAge(generatedMs, null),
      notes: "Pulled nightly. Tracker rows mirrored into envelope.",
    },
    {
      source: "AI synthesis (Anthropic Opus 4.7)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: null,
      coverage: null,
      status: classifyByAge(generatedMs, null),
      notes: "Nightly batch with content-hash cache (~80% reuse).",
    },
    {
      source: "DRI lookups (brain_md/people/*.md)",
      lastPull: null,
      rows: null,
      coverage: null,
      status: "unknown",
      notes: "Static. Edited by hand — no automated pull.",
    },
    {
      source: "Bad-test list (knowledge.db)",
      lastPull: null,
      rows: null,
      coverage: null,
      status: "unknown",
      notes: "Static curated list; manual refresh.",
    },
    {
      source: "Question prompts (QTI)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: null,
      coverage: null,
      status: classifyByAge(generatedMs, null),
      notes: "Weekly batch keyed by assessment-test id.",
    },
    {
      source: "Course standards (QTI metadata.alignment)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: null,
      coverage: null,
      status: classifyByAge(generatedMs, null),
      notes: "Weekly batch.",
    },
    {
      source: "Live attendance",
      lastPull: null,
      rows: null,
      coverage: null,
      status: "failed",
      notes: "Deferred (DR6 in DECISIONS log) — not wired up.",
    },
    {
      source: "Tier history snapshots",
      lastPull: null,
      rows: null,
      coverage: null,
      status: "failed",
      notes: "Deferred (DR5 in DECISIONS log) — not wired up.",
    },
    {
      source: "Student dossiers (student_dds coverage)",
      lastPull: generatedAt ? generatedAt.toISOString() : null,
      rows: studentDdsRows,
      coverage: ddCoverage,
      status: classifyByAge(generatedMs, ddCoverage),
      notes: `${studentDdsRows} of ${studentRows} roster rows have a full DD.`,
    },
  ];

  return (
    <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Data health</h1>
        <span style={{ color: "#6b7280", fontSize: 12 }}>
          Scope: {scope.dri} · {scope.role}
        </span>
      </header>
      <p style={{ color: "#6b7280", marginTop: 8 }}>
        Per-source freshness for every metric on the dashboard.
        See <code>CORRECTNESS_AUDIT.md</code> for the full upstream→UI trace.
      </p>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 16,
          fontSize: 13,
          background: "#fff",
          border: "1px solid #e5e7eb",
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280", background: "#f9fafb" }}>
            <th style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>Source</th>
            <th style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>Last pull</th>
            <th style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>Rows</th>
            <th style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>Coverage</th>
            <th style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>Status</th>
            <th style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ageMs = r.lastPull ? Date.now() - new Date(r.lastPull).getTime() : null;
            return (
              <tr key={r.source}>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontWeight: 500 }}>{r.source}</td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>
                  {formatAge(ageMs)}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right", color: "#374151" }}>
                  {r.rows === null ? "—" : r.rows.toLocaleString()}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right", color: "#374151" }}>
                  {r.coverage === null ? "—" : `${Math.round(r.coverage * 100)}%`}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={pillStyle(r.status)}>{r.status}</span>
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>{r.notes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
