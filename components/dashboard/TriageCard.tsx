/**
 * TriageCard — server-rendered student action card for the Triage queue.
 *
 * Card layout (per handoff):
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Aster Burns                                Critical        │
 *   │ BTX · L1 · Owner: Claudio                                  │
 *   │                                                            │
 *   │ Why now: Failed G3.12 twice without a clean recovery.      │
 *   │ Evidence: [2 doom loops] [last coached 6d ago] [policy]    │
 *   │ Suggested: 15-min guide session on climate graphs.         │
 *   │                                                            │
 *   │ [Acknowledge] [Log action] [View profile]                  │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The card is a server component. The action row is a small client island
 * (`TriageActions`) so we keep JS shipped to the browser minimal.
 */
import type { TriageItem } from "@/lib/dashboard/triage";
import { LifecycleBadge } from "./LifecycleBadge";
import { TriageActions } from "./TriageActions";
import { EscalationButton } from "./EscalationButton";

interface TriageCardProps {
  item: TriageItem;
}

function urgencyBadgeClass(urgency: TriageItem["urgency"]): string {
  if (urgency === "critical") {
    return "bg-red-100 text-red-900 border-red-200";
  }
  if (urgency === "attention") {
    return "bg-amber-100 text-amber-900 border-amber-200";
  }
  return "bg-emerald-100 text-emerald-900 border-emerald-200";
}

function evidenceChipClass(kind: TriageItem["evidence"][number]["kind"]): string {
  switch (kind) {
    case "doom_loop":
      return "bg-red-50 text-red-800 border-red-200";
    case "test_fail":
      return "bg-red-50 text-red-800 border-red-200";
    case "low_accuracy":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "skipping":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "coaching":
      return "bg-stone-50 text-stone-700 border-stone-200";
    case "policy_violation":
      return "bg-stone-50 text-stone-700 border-stone-200";
    case "post_test_gap":
      return "bg-blue-50 text-blue-800 border-blue-200";
    default:
      return "bg-white text-stone-700 border-stone-200";
  }
}

function urgencyLabel(urgency: TriageItem["urgency"]): string {
  if (urgency === "critical") return "Critical";
  if (urgency === "attention") return "Attention";
  return "On track";
}

export function TriageCard({ item }: TriageCardProps) {
  const meta = [item.campus, item.level].filter(Boolean).join(" · ");
  return (
    <article
      className="rounded-lg border border-stone-200 bg-white p-4 space-y-3"
      aria-label={`Triage card for ${item.studentName}`}
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink truncate">
            {item.studentName}
          </h3>
          <p className="text-xs text-stone-500 mt-0.5 truncate">
            {meta}
            {meta ? " · " : ""}
            <span>{item.ownerLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${urgencyBadgeClass(
              item.urgency
            )}`}
          >
            {urgencyLabel(item.urgency)}
          </span>
          <LifecycleBadge
            state={item.lifecycleState}
            latestAt={item.lifecycleAt}
            latestBy={item.lifecycleBy}
          />
        </div>
      </header>

      <p className="text-sm text-stone-800 leading-relaxed">{item.whyNow}</p>

      {item.evidence.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.evidence.map((chip, i) => (
            <span
              key={`${item.studentId}-ev-${i}`}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${evidenceChipClass(
                chip.kind
              )}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="text-xs text-stone-600 leading-relaxed">
        <span className="font-medium text-stone-700">Suggested:</span>{" "}
        {item.suggestedAction}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TriageActions
          studentId={item.studentId}
          studentSlug={item.studentSlug}
          campus={item.campus}
          subject={item.primarySubject}
          initialLifecycleState={item.lifecycleState}
        />
        <EscalationButton
          studentId={item.studentId}
          studentName={item.studentName}
          studentSlug={item.studentSlug}
          campus={item.campus}
          subject={item.primarySubject}
        />
      </div>
    </article>
  );
}
