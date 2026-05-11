"use client";

/**
 * TriageActions — client-only action row for a triage card.
 *
 * Three primary buttons, per the handoff:
 *   [Acknowledge] → POST /api/dashboard/feedback (action: acknowledge)
 *   [Log action]  → opens the existing flag modal (PR1 wired the underlying
 *                   modal inside the legacy renderer; for the new clean
 *                   surface we link to the host route with a state hint that
 *                   the renderer picks up — until PR3 ships a native modal
 *                   we use the same /api/dashboard/feedback POST + a small
 *                   inline note prompt).
 *   [View profile]→ navigate to /dashboard#/student/<slug> (handled by the
 *                   legacy renderer's hash router).
 *
 * Optimistic UI: the Acknowledge button immediately switches to a "Saved"
 * state on success, or "Could not save" on failure. No PII in error text.
 */

import { useState } from "react";

interface TriageActionsProps {
  studentId: string;
  studentSlug: string;
  campus?: string;
  subject?: string;
  flagId?: string;
  initialLifecycleState: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

async function postFeedback(payload: {
  studentId: string;
  flagId: string;
  action: "acknowledge" | "in_progress" | "note";
  note?: string;
  campus?: string;
  subject?: string;
  sourceView: string;
}): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  const res = await fetch("/api/dashboard/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: { ok?: boolean; eventId?: string; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* ignore */
  }
  if (!res.ok || !body.ok) {
    return {
      ok: false,
      error: body.error || "Could not save",
    };
  }
  return { ok: true, eventId: body.eventId };
}

export function TriageActions({
  studentId,
  studentSlug,
  campus,
  subject,
  flagId,
  initialLifecycleState,
}: TriageActionsProps) {
  const [ackState, setAckState] = useState<SaveState>(
    initialLifecycleState === "acknowledged" ||
      initialLifecycleState === "in_progress"
      ? "saved"
      : "idle"
  );
  const [logState, setLogState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveFlagId = flagId || `student:${studentId}`;

  async function onAcknowledge() {
    setAckState("saving");
    setErrorMsg(null);
    const result = await postFeedback({
      studentId,
      flagId: effectiveFlagId,
      action: "acknowledge",
      campus,
      subject,
      sourceView: "triage",
    });
    if (result.ok) {
      setAckState("saved");
    } else {
      setAckState("error");
      setErrorMsg(result.error || "Could not save");
    }
  }

  async function onLogAction() {
    // PR2 minimal: prompt for a short note, POST as a "note" event.
    // PR3 will replace this with the shared flag modal from the legacy renderer.
    const note =
      typeof window !== "undefined"
        ? window.prompt("What action did you take? (kept short)")
        : null;
    if (note === null) return;
    setLogState("saving");
    setErrorMsg(null);
    const result = await postFeedback({
      studentId,
      flagId: effectiveFlagId,
      action: "note",
      note: note.slice(0, 2000),
      campus,
      subject,
      sourceView: "triage",
    });
    if (result.ok) {
      setLogState("saved");
    } else {
      setLogState("error");
      setErrorMsg(result.error || "Could not save");
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={onAcknowledge}
        disabled={ackState === "saving" || ackState === "saved"}
        className={buttonClass(ackState, "primary")}
      >
        {ackState === "saving"
          ? "Saving…"
          : ackState === "saved"
          ? "Acknowledged"
          : ackState === "error"
          ? "Retry"
          : "Acknowledge"}
      </button>
      <button
        type="button"
        onClick={onLogAction}
        disabled={logState === "saving"}
        className={buttonClass(logState, "secondary")}
      >
        {logState === "saving"
          ? "Saving…"
          : logState === "saved"
          ? "Logged"
          : "Log action"}
      </button>
      <a
        href={`/dashboard#/student/${encodeURIComponent(studentSlug)}`}
        className="inline-flex items-center px-3 py-1.5 rounded-md text-xs border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:text-ink transition"
      >
        View profile
      </a>
      {errorMsg ? (
        <span className="text-xs text-red-700" role="status">
          {errorMsg}
        </span>
      ) : null}
    </div>
  );
}

function buttonClass(
  state: SaveState,
  variant: "primary" | "secondary"
): string {
  const base =
    "inline-flex items-center px-3 py-1.5 rounded-md text-xs border transition disabled:opacity-60 disabled:cursor-default";
  if (state === "saved") {
    return `${base} bg-emerald-50 text-emerald-800 border-emerald-200`;
  }
  if (state === "error") {
    return `${base} bg-red-50 text-red-800 border-red-200`;
  }
  if (variant === "primary") {
    return `${base} bg-ink text-white border-ink hover:bg-stone-800`;
  }
  return `${base} bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:text-ink`;
}
