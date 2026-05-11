/**
 * KpiStrip — clinical 4-6 card KPI summary for the Triage view.
 *
 * Server-rendered. No interactivity. Tabular numbers via `tabular-nums`.
 *
 * Shows exactly the cards the handoff calls out:
 *   Critical · Attention · Resolved this week · Oldest unacknowledged ·
 *   Students in scope · Data freshness
 *
 * Intentionally avoids decorative gradients, neon, or emoji-as-decoration.
 */
import type { KpiCounts } from "@/lib/dashboard/triage";

interface KpiStripProps {
  counts: KpiCounts;
}

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "critical" | "attention" | "ok" | "neutral";
}

function KpiCard({ label, value, hint, tone = "neutral" }: KpiCardProps) {
  const toneClasses: Record<NonNullable<KpiCardProps["tone"]>, string> = {
    critical: "border-red-200 bg-red-50/40",
    attention: "border-amber-200 bg-amber-50/40",
    ok: "border-emerald-200 bg-emerald-50/40",
    neutral: "border-stone-200 bg-white",
  };
  const valueClasses: Record<NonNullable<KpiCardProps["tone"]>, string> = {
    critical: "text-red-900",
    attention: "text-amber-900",
    ok: "text-emerald-900",
    neutral: "text-ink",
  };
  return (
    <div
      className={`rounded-lg border p-3 ${toneClasses[tone]}`}
      role="group"
      aria-label={label}
    >
      <div className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${valueClasses[tone]}`}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-stone-500">{hint}</div>
      ) : null}
    </div>
  );
}

export function KpiStrip({ counts }: KpiStripProps) {
  const oldestLabel =
    counts.oldestUnacknowledgedDays === null
      ? "—"
      : counts.oldestUnacknowledgedDays === 0
      ? "<1d"
      : `${counts.oldestUnacknowledgedDays}d`;

  const freshnessLabel =
    counts.dataFreshness === "fresh"
      ? "Fresh"
      : counts.dataFreshness === "partial"
      ? "Partial"
      : counts.dataFreshness === "stale"
      ? "Stale"
      : "Unknown";

  const freshnessTone: KpiCardProps["tone"] =
    counts.dataFreshness === "fresh"
      ? "ok"
      : counts.dataFreshness === "stale"
      ? "critical"
      : counts.dataFreshness === "partial"
      ? "attention"
      : "neutral";

  return (
    <section
      aria-label="Triage KPIs"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
    >
      <KpiCard
        label="Critical"
        value={String(counts.critical)}
        tone={counts.critical > 0 ? "critical" : "neutral"}
        hint="needs action now"
      />
      <KpiCard
        label="Attention"
        value={String(counts.attention)}
        tone={counts.attention > 0 ? "attention" : "neutral"}
        hint="watch this week"
      />
      <KpiCard
        label="Resolved this week"
        value={String(counts.resolvedThisWeek)}
        tone={counts.resolvedThisWeek > 0 ? "ok" : "neutral"}
        hint="last 7 days"
      />
      <KpiCard
        label="Oldest unack."
        value={oldestLabel}
        tone={
          counts.oldestUnacknowledgedDays !== null &&
          counts.oldestUnacknowledgedDays >= 3
            ? "attention"
            : "neutral"
        }
        hint="time since flagged"
      />
      <KpiCard
        label="Students in scope"
        value={String(counts.studentsInScope)}
        tone="neutral"
      />
      <KpiCard
        label="Data freshness"
        value={freshnessLabel}
        tone={freshnessTone}
      />
    </section>
  );
}
