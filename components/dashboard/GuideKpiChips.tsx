/**
 * GuideKpiChips — small, compact summary chips above the card feed.
 *
 * Three counters + a "Last refresh" timestamp. Designed for a 375px viewport:
 * each chip is ~80-100px wide, stacks gracefully if labels grow, and never
 * crowds the action queue below.
 *
 * Pure presentational server component.
 */
interface GuideKpiChipsProps {
  toDoCount: number;
  overdueCount: number;
  completedTodayCount: number;
  lastRefreshIso: string;
}

interface ChipProps {
  value: number;
  label: string;
  tone: "neutral" | "warn" | "good";
}

function Chip({ value, label, tone }: ChipProps) {
  const toneClasses: Record<ChipProps["tone"], string> = {
    neutral: "bg-gray-50 text-gray-900 border-gray-200",
    warn: "bg-amber-50 text-amber-900 border-amber-200",
    good: "bg-emerald-50 text-emerald-900 border-emerald-200",
  };
  return (
    <div
      className={`flex min-w-[88px] flex-1 flex-col items-start rounded-xl border px-3 py-2 ${toneClasses[tone]}`}
    >
      <span className="text-xl font-semibold leading-tight tabular-nums">
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-wide opacity-80">
        {label}
      </span>
    </div>
  );
}

function formatRefresh(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Central time is the canonical Alpha-Schools timezone.
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });
}

export function GuideKpiChips({
  toDoCount,
  overdueCount,
  completedTodayCount,
  lastRefreshIso,
}: GuideKpiChipsProps) {
  return (
    <section
      aria-label="Guide queue summary"
      className="flex flex-col gap-2 px-4 pt-3"
    >
      <div className="flex items-stretch gap-2">
        <Chip value={toDoCount} label="To do" tone="neutral" />
        <Chip value={overdueCount} label="Overdue" tone="warn" />
        <Chip value={completedTodayCount} label="Done today" tone="good" />
      </div>
      <div className="text-[11px] text-gray-500">
        Last refresh {formatRefresh(lastRefreshIso)}
      </div>
    </section>
  );
}
