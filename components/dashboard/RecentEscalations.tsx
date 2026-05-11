/**
 * RecentEscalations — last 7 days of feedback events (acknowledge / in_progress
 * / resolved / incorrect / note) with: kid → subject DRI → status → note preview.
 *
 * Server-rendered. Reads from the FeedbackOverlay event log via
 * `recentEscalations` in `lib/dashboard/masterView.ts`.
 */
import type { RecentEscalation } from "@/lib/dashboard/masterView";
import { LifecycleBadge } from "./LifecycleBadge";

interface RecentEscalationsProps {
  events: RecentEscalation[];
  overlayAvailable: boolean;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RecentEscalations({
  events,
  overlayAvailable,
}: RecentEscalationsProps) {
  return (
    <section aria-label="Recent escalations" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider text-stone-500 font-medium">
          Recent escalations
        </h2>
        <p className="text-xs text-stone-500">Last 7 days</p>
      </div>

      {!overlayAvailable ? (
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-xs text-stone-500">
          Feedback overlay is offline. Escalations will appear here once the
          event store is reachable.
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-xs text-stone-500">
          No escalations in the last 7 days. Acknowledgements, in-progress
          notes, and resolved actions will show up here as DRIs work the queue.
        </div>
      ) : (
        <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
          {events.slice(0, 12).map((evt) => (
            <li
              key={evt.eventId}
              className="px-3 py-2 flex items-start gap-3 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink truncate">
                    {evt.studentId}
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {evt.campus ?? "—"}
                    {evt.subject ? ` · ${evt.subject}` : ""}
                  </span>
                  <LifecycleBadge state={evt.state} variant="compact" />
                </div>
                {evt.notePreview ? (
                  <p className="text-xs text-stone-700 mt-1 leading-relaxed">
                    {evt.notePreview}
                  </p>
                ) : null}
                <p className="text-[11px] text-stone-500 mt-1">
                  Owner: {evt.ownerLabel} · {shortDate(evt.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
