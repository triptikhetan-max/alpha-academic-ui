/**
 * EvidenceTimeline — vertical, source-labeled chronology of the last
 * 30 days of evidence.
 *
 * Each row carries a source chip (AlphaTest / QTI / Timeback / Coaching /
 * MAP / AI synthesis) so the DRI can trace any claim back to its raw
 * pipeline.
 *
 * Server-rendered. No interactivity.
 */
import type { TimelineEvent, EvidenceSource } from "@/lib/dashboard/studentProfile";

interface EvidenceTimelineProps {
  events: TimelineEvent[];
}

const SOURCE_TONES: Record<EvidenceSource, string> = {
  AlphaTest: "bg-blue-50 text-blue-800 border-blue-200",
  QTI: "bg-purple-50 text-purple-800 border-purple-200",
  Timeback: "bg-stone-100 text-stone-700 border-stone-200",
  Coaching: "bg-emerald-50 text-emerald-800 border-emerald-200",
  MAP: "bg-indigo-50 text-indigo-800 border-indigo-200",
  AI: "bg-amber-50 text-amber-800 border-amber-200",
};

export function EvidenceTimeline({ events }: EvidenceTimelineProps) {
  if (events.length === 0) {
    return (
      <section
        aria-label="Evidence timeline"
        className="rounded-lg border border-stone-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-ink">Evidence timeline</h2>
        <p className="mt-2 text-sm text-stone-500">
          No events in the last 30 days.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Evidence timeline"
      className="rounded-lg border border-stone-200 bg-white p-5"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">Evidence timeline</h2>
        <span className="text-[11px] text-stone-500">last 30 days</span>
      </div>

      <ol className="mt-4 flex flex-col gap-3 border-l border-stone-200 pl-4">
        {events.map((e, idx) => (
          <li key={`${e.date}-${idx}`} className="relative">
            <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-stone-400" />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <time className="text-xs tabular-nums text-stone-600">
                {formatDate(e.date)}
              </time>
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${SOURCE_TONES[e.source]}`}
              >
                {e.source}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink">{e.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
