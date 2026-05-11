/**
 * MasterTriageQueue — Tripti's cross-campus triage list.
 *
 * Reuses the existing `<TriageCard />` so the visual treatment is identical
 * to the per-campus Triage view. The only difference is that the queue is
 * already flattened across all 4 campuses by `triageQueueAcrossCampuses`.
 *
 * Rendering rules:
 *   - Initial: top 10 cards visible
 *   - "Show 20 more" expander toggled via `?show=all` on the same URL
 *   - Empty state matches the Triage view's calm tone
 */
import Link from "next/link";
import type { TriageItem } from "@/lib/dashboard/triage";
import { TriageCard } from "./TriageCard";

interface MasterTriageQueueProps {
  items: TriageItem[];
  showAll: boolean;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}

const DEFAULT_VISIBLE = 10;

function buildShowAllHref(
  basePath: string,
  params: Record<string, string | string[] | undefined>
): string {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v) next[k] = v;
  }
  next.show = "all";
  const qs = new URLSearchParams(next).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function MasterTriageQueue({
  items,
  showAll,
  basePath,
  searchParams,
}: MasterTriageQueueProps) {
  const visible = showAll ? items : items.slice(0, DEFAULT_VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <section aria-label="Master triage queue" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider text-stone-500 font-medium">
          Triage queue
        </h2>
        <p className="text-xs text-stone-500">
          {items.length === 0
            ? "0 students"
            : `Showing ${visible.length} of ${items.length} across all campuses`}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-ink mb-1">
            No critical or attention students
          </p>
          <p className="text-xs text-stone-500 leading-relaxed">
            All 4 campuses are clear of critical issues with the current
            filter. Try removing the subject filter to see the full view.
          </p>
        </div>
      ) : (
        visible.map((item) => <TriageCard key={item.studentId} item={item} />)
      )}

      {hidden > 0 ? (
        <div className="pt-1">
          <Link
            href={buildShowAllHref(basePath, searchParams)}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:text-ink transition"
          >
            Show {hidden} more
          </Link>
        </div>
      ) : null}
    </section>
  );
}
