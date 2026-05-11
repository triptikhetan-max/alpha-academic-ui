/**
 * CoachingHistory — collapsible list of recent coaching sessions.
 *
 * Each row shows: date · subject · coach · AI summary · outcome quality
 * chip · pattern chip · recommended follow-up.
 *
 * Native <details> = server-rendered, no JS required.
 */
import type { CoachingEntry } from "@/lib/dashboard/studentProfile";

interface CoachingHistoryProps {
  events: CoachingEntry[];
}

const OUTCOME_TONES: Record<string, string> = {
  excellent: "bg-emerald-50 text-emerald-800",
  good: "bg-emerald-50 text-emerald-800",
  ok: "bg-stone-100 text-stone-700",
  poor: "bg-amber-50 text-amber-800",
  bad: "bg-red-50 text-red-800",
};

export function CoachingHistory({ events }: CoachingHistoryProps) {
  if (events.length === 0) return null;

  return (
    <details className="rounded-lg border border-stone-200 bg-white p-5 [&_summary]:cursor-pointer">
      <summary className="flex items-center justify-between text-sm font-semibold text-ink">
        <span>Coaching history</span>
        <span className="text-[11px] font-normal text-stone-500">
          {events.length} session{events.length === 1 ? "" : "s"}
        </span>
      </summary>

      <ul className="mt-4 flex flex-col gap-3">
        {events.slice(0, 12).map((e, idx) => (
          <li
            key={`${e.date || ""}-${idx}`}
            className="border-l-2 border-stone-200 pl-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {e.date ? (
                <time className="text-xs tabular-nums text-stone-600">
                  {formatDate(e.date)}
                </time>
              ) : null}
              {e.subject ? (
                <span className="text-[11px] text-stone-500">· {e.subject}</span>
              ) : null}
              {e.coach ? (
                <span className="text-[11px] text-stone-500">· {e.coach}</span>
              ) : null}
              {e.outcomeQuality ? (
                <span
                  className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    OUTCOME_TONES[e.outcomeQuality.toLowerCase()] ||
                    "bg-stone-100 text-stone-700"
                  }`}
                >
                  {e.outcomeQuality}
                </span>
              ) : null}
            </div>

            {e.aiSummary ? (
              <p className="mt-1 text-sm text-ink">{e.aiSummary}</p>
            ) : null}

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {e.pattern ? (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                  {e.pattern}
                </span>
              ) : null}
              {e.recommendedFollowup ? (
                <span className="text-[11px] italic text-stone-600">
                  Follow-up: {e.recommendedFollowup}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
