"use client";

/**
 * GuideCard — single mobile card for one assigned student-action.
 *
 * Layout (375px wide):
 *   ┌─────────────────────────────────────┐
 *   │ Aster Burns                         │
 *   │ BTX · L1 · Science                  │
 *   │                                     │
 *   │ ▸ 15-min coaching · 15 min          │
 *   │ Climate graph comparison still weak │
 *   │                                     │
 *   │ Do this:                            │
 *   │ <recommended script>                │
 *   │                                     │
 *   │ [chip] [chip] [chip]                │
 *   │                                     │
 *   │ [Start]   [Log note]   [Mark done]  │
 *   │ ⋮ More                              │
 *   └─────────────────────────────────────┘
 *
 * Touch targets: every primary button is ≥44px tall. Buttons share the row
 * equally so they're each ~110px wide on a 375px screen — easy to tap.
 *
 * Optimistic UI: tapping [Start] or [Mark done] flips local state immediately,
 * then posts to /api/dashboard/feedback. On failure we roll back and surface
 * an inline error.
 */
import { useState } from "react";
import type { GuideAction } from "@/lib/dashboard/guideQueue";
import {
  LogNoteSheet,
  type LogNoteOutcome,
  type LogNoteSubmission,
} from "./LogNoteSheet";

interface GuideCardProps {
  action: GuideAction;
}

type LocalState = "open" | "in_progress" | "resolved" | "error";

interface FeedbackPayload {
  studentId: string;
  flagId: string;
  action: "in_progress" | "resolved" | "note";
  note?: string;
  sourceView: "guide_queue";
  campus?: string;
  subject?: string;
}

interface FeedbackResponse {
  ok: boolean;
  eventId?: string;
  error?: string;
}

/**
 * POST a feedback event to the existing PR 1 endpoint. Throws on non-2xx so
 * callers can roll back optimistic state.
 */
async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  const res = await fetch("/api/dashboard/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: FeedbackResponse;
  try {
    body = (await res.json()) as FeedbackResponse;
  } catch {
    throw new Error(`Feedback save failed (${res.status})`);
  }
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `Feedback save failed (${res.status})`);
  }
  return body;
}

const OUTCOME_TO_NOTE_PREFIX: Record<LogNoteOutcome, string> = {
  done: "Done",
  student_absent: "Student absent",
  could_not_find: "Could not find student",
  needs_dri: "Needs DRI",
  wrong_flag: "Wrong flag",
  parent_follow_up: "Parent follow-up needed",
};

const CHIP_TONE: Record<string, string> = {
  info: "bg-gray-100 text-gray-700",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  good: "bg-emerald-100 text-emerald-800",
};

export function GuideCard({ action }: GuideCardProps) {
  const initialState: LocalState =
    action.state === "in_progress"
      ? "in_progress"
      : action.state === "resolved"
        ? "resolved"
        : "open";

  const [localState, setLocalState] = useState<LocalState>(initialState);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);

  if (localState === "resolved") {
    // Stay on screen for a beat with a "Done" affordance, but de-emphasised.
    return (
      <article className="mx-4 my-2 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{action.studentName}</h3>
            <p className="text-xs opacity-80">
              {action.location}
              {action.subject ? ` · ${action.subject}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white">
            ✓ Done
          </span>
        </div>
      </article>
    );
  }

  const handleStart = async () => {
    if (busy) return;
    setErrorMsg(null);
    const prev = localState;
    setLocalState("in_progress");
    setBusy(true);
    try {
      await submitFeedback({
        studentId: action.studentId,
        flagId: action.id,
        action: "in_progress",
        sourceView: "guide_queue",
        campus: action.campus,
        subject: action.subject ?? undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setErrorMsg(message);
      setLocalState(prev);
    } finally {
      setBusy(false);
    }
  };

  const handleMarkDone = async () => {
    if (busy) return;
    setErrorMsg(null);
    const prev = localState;
    setLocalState("resolved");
    setBusy(true);
    try {
      await submitFeedback({
        studentId: action.studentId,
        flagId: action.id,
        action: "resolved",
        sourceView: "guide_queue",
        campus: action.campus,
        subject: action.subject ?? undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setErrorMsg(message);
      setLocalState(prev);
    } finally {
      setBusy(false);
    }
  };

  const handleNoteSubmit = async (submission: LogNoteSubmission) => {
    const prefix = OUTCOME_TO_NOTE_PREFIX[submission.outcome];
    const fullNote = submission.note
      ? `${prefix} — ${submission.note}`
      : prefix;
    await submitFeedback({
      studentId: action.studentId,
      flagId: action.id,
      action: "note",
      note: fullNote,
      sourceView: "guide_queue",
      campus: action.campus,
      subject: action.subject ?? undefined,
    });
    // If the outcome was "done", auto-resolve to clear from queue.
    if (submission.outcome === "done") {
      setLocalState("resolved");
      try {
        await submitFeedback({
          studentId: action.studentId,
          flagId: action.id,
          action: "resolved",
          note: "Auto-resolved after Log note · Done",
          sourceView: "guide_queue",
          campus: action.campus,
          subject: action.subject ?? undefined,
        });
      } catch {
        // Note already saved — only the resolve failed. Leave state as is.
      }
    }
  };

  const handleEscalate = async () => {
    if (busy) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      await submitFeedback({
        studentId: action.studentId,
        flagId: action.id,
        action: "in_progress",
        note: "Escalated by guide",
        sourceView: "guide_queue",
        campus: action.campus,
        subject: action.subject ?? undefined,
      });
      setLocalState("in_progress");
      setShowMore(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setErrorMsg(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`mx-4 my-2 rounded-2xl border bg-white p-4 shadow-sm ${
        action.isOverdue ? "border-amber-300" : "border-gray-200"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900">
            {action.studentName}
          </h3>
          <p className="truncate text-xs text-gray-500">
            {action.location}
            {action.subject ? ` · ${action.subject}` : ""}
          </p>
        </div>
        {action.isOverdue ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Overdue
          </span>
        ) : localState === "in_progress" ? (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
            In progress
          </span>
        ) : null}
      </header>

      <div className="mt-3 flex items-baseline gap-2">
        <h4 className="text-base font-semibold text-indigo-700">
          {action.actionType}
        </h4>
        <span className="text-xs text-gray-500">· {action.estimatedTime}</span>
      </div>
      <p className="mt-1 text-sm leading-snug text-gray-800">{action.reason}</p>

      <div className="mt-3 rounded-lg bg-gray-50 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Do this
        </div>
        <p className="mt-1 whitespace-pre-line text-sm leading-snug text-gray-900">
          {action.recommendedScript}
        </p>
      </div>

      {action.evidenceChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {action.evidenceChips.map((chip, idx) => (
            <span
              key={`${chip.label}-${idx}`}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                CHIP_TONE[chip.severity ?? "info"] ?? CHIP_TONE.info
              }`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}

      {errorMsg ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {errorMsg}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={busy || localState === "in_progress"}
          className="min-h-[44px] rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700 disabled:opacity-60"
        >
          {localState === "in_progress" ? "Started" : "Start"}
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={busy}
          className="min-h-[44px] rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800 disabled:opacity-60"
        >
          Log note
        </button>
        <button
          type="button"
          onClick={handleMarkDone}
          disabled={busy}
          className="min-h-[44px] rounded-lg bg-indigo-600 text-sm font-semibold text-white disabled:opacity-60"
        >
          Mark done
        </button>
      </div>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="min-h-[36px] text-xs font-medium text-gray-500"
        >
          {showMore ? "Hide options" : "More options"}
        </button>
        {showMore ? (
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleEscalate}
              disabled={busy}
              className="min-h-[44px] rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900"
            >
              Escalate to DRI
            </button>
            <button
              type="button"
              onClick={() => {
                // Snooze = same shape as note with outcome flag, but we don't
                // open the sheet — fire-and-forget.
                submitFeedback({
                  studentId: action.studentId,
                  flagId: action.id,
                  action: "note",
                  note: "Snoozed by guide",
                  sourceView: "guide_queue",
                  campus: action.campus,
                  subject: action.subject ?? undefined,
                }).catch((err: unknown) => {
                  const message =
                    err instanceof Error ? err.message : "Could not save.";
                  setErrorMsg(message);
                });
                setShowMore(false);
              }}
              disabled={busy}
              className="min-h-[44px] rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700"
            >
              Snooze
            </button>
            <button
              type="button"
              onClick={() => {
                submitFeedback({
                  studentId: action.studentId,
                  flagId: action.id,
                  action: "note",
                  note: "Marked not needed by guide",
                  sourceView: "guide_queue",
                  campus: action.campus,
                  subject: action.subject ?? undefined,
                }).catch((err: unknown) => {
                  const message =
                    err instanceof Error ? err.message : "Could not save.";
                  setErrorMsg(message);
                });
                setShowMore(false);
              }}
              disabled={busy}
              className="min-h-[44px] rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700"
            >
              Not needed
            </button>
            <a
              href={`/dashboard#/students/${encodeURIComponent(action.studentId)}`}
              className="flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700"
            >
              View student
            </a>
          </div>
        ) : null}
      </div>

      <LogNoteSheet
        open={sheetOpen}
        studentName={action.studentName}
        actionType={action.actionType}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleNoteSubmit}
      />
    </article>
  );
}
