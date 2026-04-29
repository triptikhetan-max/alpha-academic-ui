"use client";

/**
 * Small status pill rendered on the review page header. Pure presentation —
 * the actual status comes from the brain row, so the colour mapping here
 * lives client-side only because the parent server component renders this
 * inside a whitespace-sensitive flex layout.
 */

interface Props {
  status: string;
}

const STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-200",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  needs_revision: "bg-blue-100 text-blue-900 border-blue-200",
  rejected: "bg-red-100 text-red-900 border-red-200",
  stale: "bg-stone-100 text-stone-600 border-stone-200",
};

const LABELS: Record<string, string> = {
  pending: "⏳ Pending",
  approved: "✅ Approved",
  needs_revision: "↩️ Needs revision",
  rejected: "❌ Rejected",
  stale: "⏰ Stale",
};

export function ReviewStatusBadge({ status }: Props) {
  const style = STYLES[status] ?? "bg-stone-100 text-stone-700 border-stone-200";
  const label = LABELS[status] ?? status;
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${style}`}
    >
      {label}
    </span>
  );
}
