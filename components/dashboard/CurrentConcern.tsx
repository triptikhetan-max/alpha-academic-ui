/**
 * CurrentConcern — top concern + 1-line "what to do next".
 *
 * Above-the-fold item #2 per the handoff. Two-line micro-card.
 * Open flags render in a sibling component.
 */
import type { OpenFlag } from "@/lib/dashboard/studentProfile";

interface CurrentConcernProps {
  concern: string;
  recommendedAction: string;
  flags: OpenFlag[];
}

const SEVERITY_TONES: Record<OpenFlag["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-900",
  attention: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-stone-200 bg-stone-50 text-stone-700",
};

const STATE_LABELS: Record<OpenFlag["state"], string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  resolved: "Resolved",
  incorrect: "Marked incorrect",
  snoozed: "Snoozed",
  escalated: "Escalated",
};

const STATE_TONES: Record<OpenFlag["state"], string> = {
  open: "bg-stone-100 text-stone-700",
  acknowledged: "bg-blue-50 text-blue-800",
  in_progress: "bg-amber-50 text-amber-800",
  resolved: "bg-emerald-50 text-emerald-800",
  incorrect: "bg-stone-100 text-stone-500",
  snoozed: "bg-stone-100 text-stone-500",
  escalated: "bg-purple-50 text-purple-800",
};

export function CurrentConcern({
  concern,
  recommendedAction,
  flags,
}: CurrentConcernProps) {
  return (
    <section
      aria-label="Current concern"
      className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
          Current concern
        </div>
        <p className="mt-1 text-base text-ink">{concern}</p>
      </div>

      <div className="mt-3 border-t border-stone-100 pt-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
          Recommended action
        </div>
        <p className="mt-1 text-base text-ink">{recommendedAction}</p>
      </div>

      {flags.length > 0 ? (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
            Open flags
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {flags.map((f) => (
              <li
                key={f.flagId}
                className={`flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${SEVERITY_TONES[f.severity]}`}
              >
                <span className="font-medium">{f.label}</span>
                {f.subject ? (
                  <span className="text-xs opacity-75">· {f.subject}</span>
                ) : null}
                <span className="ml-auto inline-flex items-center gap-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATE_TONES[f.state]}`}
                  >
                    {STATE_LABELS[f.state]}
                  </span>
                  <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-stone-600">
                    {f.source}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-4 border-t border-stone-100 pt-3 text-sm text-stone-500">
          No open flags right now.
        </div>
      )}
    </section>
  );
}
