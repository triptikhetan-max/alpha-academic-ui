/**
 * SubjectRollup — 8-card grid (Math / Reading / ... / FastMath) showing
 * subject-level health.
 *
 * Each card is a chip-style toggle that adds itself to the `?subject=`
 * URL parameter on the SAME master page. Clicking Math while Reading is
 * already selected produces `?subject=Math,Reading`. Clicking an active
 * subject removes it. This is the master view's drill-down mechanic and
 * is intentionally NOT a navigation to a separate subject view.
 */
import Link from "next/link";
import type { SubjectRollup as SubjectRollupItem } from "@/lib/dashboard/masterView";

interface SubjectRollupProps {
  /** Card data per subject (always rendered for all 8 subjects). */
  rollups: SubjectRollupItem[];
  /** Currently active subjects (case-insensitive match). */
  active: string[];
  /** Path used to build the toggle link, e.g. `/dashboard`. */
  basePath: string;
  /** Existing URL params so we preserve them when toggling subject filters. */
  searchParams: Record<string, string | string[] | undefined>;
}

function buildToggleHref(
  subject: string,
  active: string[],
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string" && v && k !== "subject") next[k] = v;
  }
  const lower = subject.toLowerCase();
  const cur = new Set(active.map((s) => s.toLowerCase()));
  let resulting: string[];
  if (cur.has(lower)) {
    resulting = active.filter((s) => s.toLowerCase() !== lower);
  } else {
    resulting = [...active, subject];
  }
  if (resulting.length > 0) {
    next.subject = resulting.join(",");
  }
  const qs = new URLSearchParams(next).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function SubjectCard({
  rollup,
  isActive,
  href,
}: {
  rollup: SubjectRollupItem;
  isActive: boolean;
  href: string;
}) {
  const base = "block rounded-lg border p-3 transition hover:shadow-sm";
  const tone = isActive
    ? "border-ink bg-stone-900 text-white"
    : rollup.critical > 0
    ? "border-red-200 bg-red-50/40 hover:border-red-300"
    : rollup.attention > 0
    ? "border-amber-200 bg-amber-50/40 hover:border-amber-300"
    : "border-stone-200 bg-white hover:border-stone-300";

  const muted = isActive ? "text-stone-300" : "text-stone-500";
  const valueClass = isActive ? "text-white" : "text-ink";

  return (
    <Link
      href={href}
      className={`${base} ${tone}`}
      aria-pressed={isActive}
      aria-label={`Toggle ${rollup.subject} subject filter`}
    >
      <div className="flex items-start justify-between">
        <h3 className={`text-sm font-semibold ${valueClass}`}>{rollup.subject}</h3>
        <span className={`text-[10px] uppercase tracking-wider ${muted}`}>
          {rollup.studentsFlagged} flagged
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-3 text-xs">
        <span className="tabular-nums">
          <span className={isActive ? "text-red-300" : "text-red-800"}>
            {rollup.critical}
          </span>
          <span className={`ml-1 ${muted}`}>crit</span>
        </span>
        <span className="tabular-nums">
          <span className={isActive ? "text-amber-300" : "text-amber-900"}>
            {rollup.attention}
          </span>
          <span className={`ml-1 ${muted}`}>att</span>
        </span>
      </div>
      <div className={`mt-2 text-[11px] truncate ${muted}`} title={rollup.topConcept}>
        Top gap: <span className={isActive ? "text-stone-100" : "text-stone-700"}>
          {rollup.topConcept}
        </span>
      </div>
    </Link>
  );
}

export function SubjectRollup({
  rollups,
  active,
  basePath,
  searchParams,
}: SubjectRollupProps) {
  const lowerActive = new Set(active.map((s) => s.toLowerCase()));
  return (
    <section aria-label="Subject rollup" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider text-stone-500 font-medium">
          Subjects
        </h2>
        <p className="text-xs text-stone-500">
          Click to drill into a subject (filters this page)
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {rollups.map((r) => {
          const isActive = lowerActive.has(r.subject.toLowerCase());
          const href = buildToggleHref(
            r.subject,
            active,
            basePath,
            searchParams
          );
          return (
            <SubjectCard
              key={r.subject}
              rollup={r}
              isActive={isActive}
              href={href}
            />
          );
        })}
      </div>
    </section>
  );
}
