"use client";

/**
 * StudentActionBar — sticky lifecycle action buttons for a single student.
 *
 * POSTs to /api/dashboard/feedback (already shipped in PR 1). The endpoint
 * verifies session + scope server-side and writes a durable Blob event.
 *
 * Five primary actions per the handoff:
 *   Acknowledge · Mark in progress · Log action · Resolve · Mark incorrect
 *
 * Local state tracks: idle / saving / ok / error. On success the button
 * stays in `ok` for ~1.5s before returning to idle. Errors are non-fatal
 * and shown inline — there's no toast system in this codebase.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Action =
  | "acknowledge"
  | "in_progress"
  | "resolved"
  | "incorrect"
  | "note";

interface StudentActionBarProps {
  studentId: string;
  /** Optional flag id when the action targets a specific flag; otherwise scope is "_student". */
  flagId?: string;
  /** Used as `sectionId` fallback when no flagId is present (the schema requires one of the two). */
  sectionId: string;
  campus?: string;
  subject?: string;
  sourceView: string;
  dataVersion?: string;
}

interface ActionState {
  status: "idle" | "saving" | "ok" | "error";
  message?: string;
}

export function StudentActionBar({
  studentId,
  flagId,
  sectionId,
  campus,
  subject,
  sourceView,
  dataVersion,
}: StudentActionBarProps) {
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function submit(action: Action, withNote?: string) {
    setState({ status: "saving" });
    try {
      const body: Record<string, unknown> = {
        studentId,
        action,
        sourceView,
      };
      if (flagId) body.flagId = flagId;
      else body.sectionId = sectionId;
      if (campus) body.campus = campus;
      if (subject) body.subject = subject;
      if (dataVersion) body.dataVersion = dataVersion;
      if (withNote && withNote.trim()) {
        body.note = withNote.trim().slice(0, 2000);
      }

      const res = await fetch("/api/dashboard/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });

      let result: { ok?: boolean; error?: string } | null = null;
      try {
        result = await res.json();
      } catch {
        result = null;
      }

      if (!res.ok || !result || result.ok !== true) {
        const message = (result && result.error) || "Could not save";
        setState({ status: "error", message });
        return;
      }

      setState({ status: "ok", message: actionLabel(action) + " saved" });
      // Clear note + collapse the form on success.
      if (action === "note") {
        setNote("");
        setShowNote(false);
      }
      // Refresh the server-rendered profile so the new lifecycle state
      // shows up in the OpenFlags overlay on the next render pass.
      startTransition(() => {
        router.refresh();
      });

      window.setTimeout(() => {
        setState({ status: "idle" });
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save";
      setState({ status: "error", message });
    }
  }

  return (
    <div
      className="sticky top-[68px] z-10 border-b border-stone-200 bg-white/95 backdrop-blur"
      role="toolbar"
      aria-label="Student lifecycle actions"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <ActionButton
          label="Acknowledge"
          tone="primary"
          onClick={() => submit("acknowledge")}
          disabled={state.status === "saving"}
        />
        <ActionButton
          label="Mark in progress"
          tone="primary"
          onClick={() => submit("in_progress")}
          disabled={state.status === "saving"}
        />
        <ActionButton
          label={showNote ? "Cancel note" : "Log action"}
          tone="secondary"
          onClick={() => setShowNote((s) => !s)}
          disabled={state.status === "saving"}
        />
        <ActionButton
          label="Resolve"
          tone="success"
          onClick={() => submit("resolved")}
          disabled={state.status === "saving"}
        />
        <ActionButton
          label="Mark incorrect"
          tone="danger"
          onClick={() => submit("incorrect")}
          disabled={state.status === "saving"}
        />

        <div
          aria-live="polite"
          className="ml-auto min-w-[120px] text-right text-xs"
        >
          {state.status === "saving" ? (
            <span className="text-stone-500">Saving…</span>
          ) : null}
          {state.status === "ok" ? (
            <span className="text-emerald-700">{state.message}</span>
          ) : null}
          {state.status === "error" ? (
            <span className="text-red-700" role="alert">
              {state.message}
            </span>
          ) : null}
        </div>
      </div>

      {showNote ? (
        <div className="mx-auto max-w-5xl border-t border-stone-100 px-4 py-2 sm:px-6">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
              Note (optional)
            </span>
            <textarea
              className="mt-1 w-full resize-y rounded-md border border-stone-300 bg-white p-2 text-sm focus:border-stone-400 focus:outline-none"
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you observe? Keep it short."
            />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <ActionButton
              label="Save note"
              tone="primary"
              onClick={() => submit("note", note)}
              disabled={state.status === "saving" || !note.trim()}
            />
            <span className="text-[11px] text-stone-500">
              {2000 - note.length} chars left
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function actionLabel(action: Action): string {
  switch (action) {
    case "acknowledge":
      return "Acknowledged";
    case "in_progress":
      return "In progress";
    case "resolved":
      return "Resolved";
    case "incorrect":
      return "Marked incorrect";
    case "note":
      return "Note";
  }
}

function ActionButton({
  label,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  tone: "primary" | "secondary" | "success" | "danger";
  onClick: () => void;
  disabled?: boolean;
}) {
  const cls = (() => {
    switch (tone) {
      case "primary":
        return "border-stone-300 bg-white text-ink hover:border-stone-400 hover:bg-stone-50";
      case "secondary":
        return "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100";
      case "success":
        return "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
      case "danger":
        return "border-red-200 bg-red-50 text-red-900 hover:bg-red-100";
    }
  })();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {label}
    </button>
  );
}
