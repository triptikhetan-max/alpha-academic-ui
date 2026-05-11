"use client";

/**
 * LogNoteSheet — bottom-sheet modal for the "Log note" action.
 *
 * Shown by GuideCard when the guide taps [Log note]. Captures:
 *   - Outcome (Done / Student absent / Could not find / Needs DRI / Wrong flag /
 *     Parent follow-up needed)
 *   - Free-text note
 *   - Optional follow-up flag
 *
 * On submit, posts an `action: "note"` event to /api/dashboard/feedback with
 * `sourceView: "guide_queue"`. The actual POST is handled by the parent via
 * the `onSubmit` callback so the parent can run optimistic UI updates.
 *
 * Mobile-first: takes the bottom 80% of the viewport on small screens, slides
 * up from the bottom, and dismisses on backdrop tap or "Cancel".
 */
import { useEffect, useRef, useState } from "react";

export type LogNoteOutcome =
  | "done"
  | "student_absent"
  | "could_not_find"
  | "needs_dri"
  | "wrong_flag"
  | "parent_follow_up";

const OUTCOMES: Array<{ value: LogNoteOutcome; label: string }> = [
  { value: "done", label: "Done" },
  { value: "student_absent", label: "Student absent" },
  { value: "could_not_find", label: "Could not find" },
  { value: "needs_dri", label: "Needs DRI" },
  { value: "wrong_flag", label: "Wrong flag" },
  { value: "parent_follow_up", label: "Parent follow-up needed" },
];

export interface LogNoteSubmission {
  outcome: LogNoteOutcome;
  note: string;
}

interface LogNoteSheetProps {
  open: boolean;
  studentName: string;
  actionType: string;
  onClose: () => void;
  onSubmit: (payload: LogNoteSubmission) => Promise<void>;
}

export function LogNoteSheet({
  open,
  studentName,
  actionType,
  onClose,
  onSubmit,
}: LogNoteSheetProps) {
  const [outcome, setOutcome] = useState<LogNoteOutcome>("done");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset state on open.
  useEffect(() => {
    if (open) {
      setOutcome("done");
      setNote("");
      setError(null);
      setSubmitting(false);
      // Focus textarea after the sheet animates in.
      const t = setTimeout(() => textareaRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
    return;
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ outcome, note: note.trim() });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save note.";
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-note-title"
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-screen-sm rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200" aria-hidden="true" />
        <h2
          id="log-note-title"
          className="text-lg font-semibold leading-tight text-gray-900"
        >
          Log note · {studentName}
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">{actionType}</p>

        <div className="mt-4">
          <label
            htmlFor="log-note-outcome"
            className="block text-sm font-medium text-gray-700"
          >
            Outcome
          </label>
          <select
            id="log-note-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as LogNoteOutcome)}
            className="mt-1 block min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
          >
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <label
            htmlFor="log-note-text"
            className="block text-sm font-medium text-gray-700"
          >
            Note
          </label>
          <textarea
            id="log-note-text"
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What happened? Keep it short."
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
        </div>

        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white text-base font-medium text-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] flex-1 rounded-lg bg-indigo-600 text-base font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save note"}
          </button>
        </div>
      </form>
    </div>
  );
}
