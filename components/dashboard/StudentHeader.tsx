/**
 * StudentHeader — sticky identity strip at the top of the unified profile.
 *
 * Above-the-fold item #1 per the handoff.
 *
 * Server-rendered. No interactivity here — feedback action buttons live in
 * the sibling `StudentActionBar` (client component) so this component can
 * stay an RSC.
 */
import type { StudentIdentity } from "@/lib/dashboard/studentProfile";

interface StudentHeaderProps {
  identity: StudentIdentity;
  ownerLabel: string;
  /** Coarse current state shown next to the name. */
  state: "critical" | "attention" | "on_track" | "resolved";
  dataGeneratedAt?: string;
}

const STATE_LABELS: Record<StudentHeaderProps["state"], string> = {
  critical: "Critical",
  attention: "Attention",
  on_track: "On Track",
  resolved: "Resolved",
};

const STATE_TONES: Record<StudentHeaderProps["state"], string> = {
  critical: "border-red-200 bg-red-50 text-red-900",
  attention: "border-amber-200 bg-amber-50 text-amber-900",
  on_track: "border-emerald-200 bg-emerald-50 text-emerald-900",
  resolved: "border-stone-200 bg-stone-50 text-stone-700",
};

export function StudentHeader({
  identity,
  ownerLabel,
  state,
  dataGeneratedAt,
}: StudentHeaderProps) {
  const scopeLine = [
    identity.campus,
    identity.level,
    identity.workingGrade
      ? `Grade ${identity.workingGrade} working level`
      : identity.grade
      ? `Grade ${identity.grade}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <header
      className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur"
      aria-label="Student header"
    >
      <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">
            {identity.name}
          </h1>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATE_TONES[state]}`}
          >
            {STATE_LABELS[state]}
          </span>
          {identity.tier && identity.tier !== "active" ? (
            <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs text-stone-700">
              Tier: {identity.tier}
            </span>
          ) : null}
        </div>

        <div className="mt-1 text-sm text-stone-600">
          {scopeLine || "—"}
          {ownerLabel ? <span className="ml-2 text-stone-500">· {ownerLabel}</span> : null}
        </div>

        {dataGeneratedAt ? (
          <div className="mt-1 text-[11px] text-stone-500">
            Data refreshed {formatRelative(dataGeneratedAt)}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const ageHrs = (Date.now() - t) / (1000 * 60 * 60);
  if (ageHrs < 1) return "just now";
  if (ageHrs < 24) return `${Math.floor(ageHrs)}h ago`;
  const days = Math.floor(ageHrs / 24);
  return `${days}d ago`;
}
