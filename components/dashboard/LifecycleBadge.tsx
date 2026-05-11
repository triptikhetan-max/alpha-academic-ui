/**
 * LifecycleBadge — small pill that renders the current lifecycle state for a
 * triage card (Open / Acknowledged / In Progress / Resolved / Incorrect / Snoozed).
 *
 * Server component. No interactivity. Used on triage cards, manager overview,
 * and the subject DRI student queue so the visual treatment stays consistent.
 */
import type { LifecycleState } from "@/lib/dashboard/feedbackOverlay";

interface LifecycleBadgeProps {
  state: LifecycleState;
  /** Optional ISO timestamp for "Acked 2d ago" suffix. Hidden on small variants. */
  latestAt?: string;
  /** Optional email/name of the actor — first token is rendered as "by Claudio". */
  latestBy?: string;
  /** Visual variant. `compact` is used in dense lists, `default` on cards. */
  variant?: "default" | "compact";
}

function classFor(state: LifecycleState): string {
  switch (state) {
    case "open":
      return "bg-white text-stone-500 border-stone-200";
    case "acknowledged":
      return "bg-stone-100 text-stone-700 border-stone-200";
    case "in_progress":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "resolved":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "incorrect":
      return "bg-stone-50 text-stone-600 border-stone-200";
    case "snoozed":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "escalated":
      return "bg-purple-50 text-purple-800 border-purple-200";
    default:
      return "bg-white text-stone-500 border-stone-200";
  }
}

function labelFor(state: LifecycleState): string {
  switch (state) {
    case "open":
      return "Open";
    case "acknowledged":
      return "Acknowledged";
    case "in_progress":
      return "In progress";
    case "resolved":
      return "Resolved";
    case "incorrect":
      return "Incorrect";
    case "snoozed":
      return "Snoozed";
    case "escalated":
      return "Escalated";
    default:
      return state;
  }
}

function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function firstToken(s?: string): string | null {
  if (!s) return null;
  const local = s.includes("@") ? s.split("@")[0] : s;
  const first = local.split(/[._\s]/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function LifecycleBadge({
  state,
  latestAt,
  latestBy,
  variant = "default",
}: LifecycleBadgeProps) {
  const compact = variant === "compact";
  const cls = classFor(state);
  const padding = compact ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const text = compact ? "text-[10px]" : "text-[11px]";

  const rel = !compact ? relativeTime(latestAt) : null;
  const who = !compact ? firstToken(latestBy) : null;
  const suffix =
    state !== "open" && (rel || who)
      ? ` · ${[who, rel].filter(Boolean).join(" ")}`
      : "";

  return (
    <span
      className={`inline-flex items-center rounded-full border ${padding} ${text} ${cls}`}
      aria-label={`Lifecycle state: ${labelFor(state)}`}
    >
      {labelFor(state)}
      {suffix}
    </span>
  );
}
