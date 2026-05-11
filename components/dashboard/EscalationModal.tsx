"use client";

/**
 * EscalationModal — Campus DRI raises a flag to a Subject DRI.
 *
 * Opens from `EscalationButton`. Resolves the recipient server-side via the
 * feedback POST (the API does the routing — we just show the resolved name in
 * the success state). Keeps the field surface tiny:
 *   - Subject (read-only, autopopulated from the flag)
 *   - Note (optional textarea, max 2000 chars)
 *
 * On success, displays "Escalated to <Name> · email sent ✓".
 */
import { useState } from "react";

interface EscalationModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  studentSlug: string;
  campus?: string;
  subject?: string;
  grade?: number;
  flagId?: string;
}

interface EscalationResponse {
  ok: boolean;
  eventId?: string;
  escalatedTo?: string;
  escalatedToName?: string;
  error?: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

async function postEscalation(payload: {
  studentId: string;
  flagId: string;
  subject?: string;
  campus?: string;
  grade?: number;
  note?: string;
}): Promise<EscalationResponse> {
  const res = await fetch("/api/dashboard/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      action: "escalated",
      sourceView: "escalation-modal",
    }),
  });
  let body: EscalationResponse = { ok: false };
  try {
    body = (await res.json()) as EscalationResponse;
  } catch {
    /* ignore */
  }
  if (!res.ok || !body.ok) {
    return {
      ok: false,
      error: body.error || "Could not escalate",
    };
  }
  return body;
}

export function EscalationModal(props: EscalationModalProps) {
  const {
    open,
    onClose,
    studentId,
    studentName,
    campus,
    subject,
    grade,
    flagId,
  } = props;

  const [note, setNote] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);
  const [resultEmail, setResultEmail] = useState<string | null>(null);

  if (!open) return null;

  const effectiveFlagId = flagId || `student:${studentId}`;

  async function onSend() {
    setState("saving");
    setErrorMsg(null);
    const result = await postEscalation({
      studentId,
      flagId: effectiveFlagId,
      subject,
      campus,
      grade,
      note: note.trim() || undefined,
    });
    if (result.ok) {
      setState("saved");
      setResultName(result.escalatedToName ?? null);
      setResultEmail(result.escalatedTo ?? null);
    } else {
      setState("error");
      setErrorMsg(result.error || "Could not escalate");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Escalate ${studentName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white border border-stone-200 shadow-xl p-5 space-y-4">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-ink">Escalate to Subject DRI</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {studentName}
              {subject ? ` · ${subject}` : ""}
              {typeof grade === "number" ? ` · Grade ${grade}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:text-stone-700 text-lg leading-none"
          >
            ×
          </button>
        </header>

        {state === "saved" ? (
          <div
            role="status"
            className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900"
          >
            Escalated to {resultName ?? resultEmail ?? "Subject DRI"} · email sent ✓
          </div>
        ) : (
          <>
            <div className="text-xs text-stone-600">
              The Subject DRI for this subject + grade will be auto-resolved server-side.
              They will receive an email with the kid + your note + a link back here.
            </div>
            <label className="block">
              <span className="text-xs font-medium text-stone-700">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="Why are you escalating? What have you tried?"
                className="mt-1 w-full rounded-md border border-stone-200 bg-white p-2 text-sm focus:border-stone-400 focus:outline-none"
              />
              <span className="mt-0.5 block text-right text-[10px] text-stone-400">
                {note.length}/2000
              </span>
            </label>
            {errorMsg ? (
              <p className="text-xs text-red-700" role="alert">
                {errorMsg}
              </p>
            ) : null}
          </>
        )}

        <footer className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs border border-stone-200 bg-white text-stone-700 hover:border-stone-300"
          >
            {state === "saved" ? "Close" : "Cancel"}
          </button>
          {state !== "saved" ? (
            <button
              type="button"
              onClick={onSend}
              disabled={state === "saving"}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs border border-ink bg-ink text-white hover:bg-stone-800 disabled:opacity-60"
            >
              {state === "saving" ? "Sending…" : "Send escalation"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
