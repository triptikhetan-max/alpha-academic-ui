/**
 * LevelRollupCards — per-level rollup row.
 *
 * Mirrors `CampusRollupCards` but for the level dimension (WL/LL/L1/L2/MS).
 * Each card drills into the same dashboard URL pre-filtered to that level.
 *
 * Auto-hidden by the parent (`UnifiedDashboard`) when the caller's scope
 * spans <2 levels, so we don't render a 1-card "rollup".
 */
import type { LevelRollup } from "@/lib/dashboard/masterView";

interface LevelRollupCardsProps {
  rollups: LevelRollup[];
}

function LevelCard({ rollup }: { rollup: LevelRollup }) {
  const tone =
    rollup.critical > 0
      ? "border-red-200 bg-red-50/40"
      : rollup.attention > 0
      ? "border-amber-200 bg-amber-50/40"
      : "border-stone-200 bg-white";

  // TODO(level-drilldown): wire `?level=…` into the data fetcher so clicking
  // a card narrows the queue + KPIs. For now this is a read-only segmentation.
  return (
    <article
      className={`block rounded-lg border p-3 ${tone}`}
      aria-label={`Level ${rollup.levelLabel} summary`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">
            {rollup.levelLabel}
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {rollup.studentsInScope} students
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

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-stone-700">
        <div>
          <div className="text-stone-500 uppercase tracking-wider">
            Attention
          </div>
          <div className="text-base font-semibold text-amber-900 tabular-nums">
            {rollup.attention}
          </div>
        </div>
        <div>
          <div className="text-stone-500 uppercase tracking-wider">
            Top issue
          </div>
          <div
            className="text-[11px] font-medium text-stone-800 truncate"
            title={rollup.topIssue}
          >
            {rollup.topIssue}
          </div>
        </div>
      </div>
    </article>
  );
}

export function LevelRollupCards({ rollups }: LevelRollupCardsProps) {
  return (
    <section aria-label="Level rollup" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider text-stone-500 font-medium">
          Levels
        </h2>
        <p className="text-xs text-stone-500">Health by level in scope</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {rollups.map((r) => (
          <LevelCard key={r.levelId} rollup={r} />
        ))}
      </div>
    </section>
  );
}
