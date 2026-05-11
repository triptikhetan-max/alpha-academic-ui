"use client";

/**
 * ActionLogRow — single row of the Campus DRI's escalation audit log.
 *
 * Renders the kid + escalation target + current status, and a tiny inline
 * dropdown to update status. Status updates write a follow-up `note`
 * event to `/api/dashboard/feedback` with a structured note string
 * (`escalation-status:<value>`) so the existing event store stays the
 * single source of truth — no schema migration needed.
 */
import { useState } from "react";
import Link from "next/link";

export type EscalationStatus =
  | "open"
  | "acked_by_sd"
  | "in_progress"
  | "done"
  | "off";

export interface ActionLogRowData {
  eventId: string;
  studentId: string;
  studentSlug: string;
  studentName: string;
  subject: string;
  raisedAt: string;
  raisedToName: string;
  raisedToEmail: string;
  status: EscalationStatus;
  latestNote?: string;
  flagId?: string;
}

const STATUS_LABEL: Record<EscalationStatus, string> = {
  open: "Open",
  acked_by_sd: "Acked by SD",
  in_progress: "In progress",
  done: "Done",
  off: "Off",
};

const STATUS_CLASS: Record<EscalationStatus, string> = {
  open: "bg-stone-100 text-stone-800 border-stone-200",
  acked_by_sd: "bg-blue-50 text-blue-900 border-blue-200",
  in_progress: "bg-indigo-50 text-indigo-900 border-indigo-200",
  done: "bg-emerald-50 text-emerald-900 border-emerald-200",
  off: "bg-stone-50 text-stone-600 border-stone-200",
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

interface ActionLogRowProps {
  row: ActionLogRowData;
}

export function ActionLogRow({ row }: ActionLogRowProps) {
  const [status, setStatus] = useState<EscalationStatus>(row.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChangeStatus(next: EscalationStatus) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: row.studentId,
          flagId: row.flagId || `student:${row.studentId}`,
          action: "note",
          note: `escalation-status:${next}`,
          subject: row.subject,
          sourceView: "action-log",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Could not update status");
      }
      setStatus(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-stone-200 align-top">
      <td className="py-2 pr-3">
        <Link
          href={`/dashboard#/student/${encodeURIComponent(row.studentSlug)}`}
          className="text-sm font-medium text-ink hover:underline"
        >
          {row.studentName}
        </Link>
      </td>
      <td className="py-2 pr-3 text-sm text-stone-700">{row.subject}</td>
      <td className="py-2 pr-3 text-xs text-stone-500 whitespace-nowrap">
        {formatDate(row.raisedAt)}
      </td>
      <td className="py-2 pr-3 text-xs text-stone-700">
        <div>{row.raisedToName}</div>
        <div className="text-[11px] text-stone-500">{row.raisedToEmail}</div>
      </td>
      <td className="py-2 pr-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLASS[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </td>
      <td className="py-2 pr-3 text-xs text-stone-600">
        {row.latestNote || ""}
      </td>
      <td className="py-2 text-xs">
        <select
          value={status}
          disabled={saving}
          onChange={(e) =>
            onChangeStatus(e.target.value as EscalationStatus)
          }
          className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs disabled:opacity-60"
          aria-label={`Update status for ${row.studentName}`}
        >
          {(Object.keys(STATUS_LABEL) as EscalationStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        {error ? (
          <p className="mt-1 text-[11px] text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
