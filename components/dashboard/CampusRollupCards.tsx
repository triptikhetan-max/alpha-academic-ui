/**
 * CampusRollupCards — 4-card row showing per-campus health for Tripti.
 *
 * Each card is a `<Link />` that drills into the existing PR2 triage view
 * pre-filtered to that campus (`/dashboard/triage?campus=BTX`). Tripti
 * stays on the master page; clicking the card opens the campus DRI's
 * exact view in a new screen.
 *
 * Visual rules: same calm clinical aesthetic as the triage view —
 * muted maroon for critical, amber for attention, semantic muted colors,
 * no decorative gradients or emoji.
 */
import Link from "next/link";
import type { CampusRollup } from "@/lib/dashboard/masterView";

interface CampusRollupCardsProps {
  rollups: CampusRollup[];
}

function oldestLabel(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "<1d";
  return `${days}d`;
}

function CampusCard({ rollup }: { rollup: CampusRollup }) {
  const href = `/dashboard/triage?campus=${encodeURIComponent(rollup.campusId)}`;
  const tone =
    rollup.critical > 0
      ? "border-red-200 bg-red-50/40"
      : rollup.attention > 0
      ? "border-amber-200 bg-amber-50/40"
      : "border-stone-200 bg-white";

  return (
    <Link
      href={href}
      className={`block rounded-lg border p-3 transition hover:border-stone-300 hover:shadow-sm ${tone}`}
      aria-label={`Drill into ${rollup.campusLabel} campus triage`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">
            {rollup.campusLabel}
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {rollup.studentsInScope} students · DRI: {rollup.driName.split(" ")[0]}
          </p>
        </div>
        <div className="text-right">
          <span className="block text-2xl font-semibold text-red-900 tabular-nums">
            {rollup.critical}
          </span>
          <span className="block text-[10px] uppercase tracking-wider text-stone-500">
            critical
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-stone-700">
        <div>
          <div className="text-stone-500 uppercase tracking-wider">Attention</div>
          <div className="text-base font-semibold text-amber-900 tabular-nums">
            {rollup.attention}
          </div>
        </div>
        <div>
          <div className="text-stone-500 uppercase tracking-wider">Oldest</div>
          <div className="text-base font-semibold text-stone-800 tabular-nums">
            {oldestLabel(rollup.oldestUnacknowledgedDays)}
          </div>
        </div>
        <div>
          <div className="text-stone-500 uppercase tracking-wider">Top issue</div>
          <div className="text-[11px] font-medium text-stone-800 truncate" title={rollup.topIssue}>
            {rollup.topIssue}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CampusRollupCards({ rollups }: CampusRollupCardsProps) {
  return (
    <section aria-label="Campus rollup" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider text-stone-500 font-medium">
          Campuses
        </h2>
        <p className="text-xs text-stone-500">Click a card to drill into that campus</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {rollups.map((r) => (
          <CampusCard key={r.campusId} rollup={r} />
        ))}
      </div>
    </section>
  );
}
