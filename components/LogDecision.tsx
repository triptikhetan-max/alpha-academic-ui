"use client";

import { useState } from "react";

type Mode = "new" | "update";

export function LogDecision() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("new");
  const [title, setTitle] = useState("");
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [owner, setOwner] = useState("");
  const [decidedOn, setDecidedOn] = useState("");
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDecision("");
    setRationale("");
    setOwner("");
    setDecidedOn("");
    setSource("");
    setSent(false);
    setError(null);
  }

  async function submit() {
    if (!title.trim() || !decision.trim()) return;
    setSubmitting(true);
    setError(null);
    const message =
      `[${mode === "new" ? "NEW DECISION" : "UPDATE TO DECISION"}] ${title}\n\n` +
      `Decision: ${decision}\n` +
      (rationale ? `Why: ${rationale}\n` : "") +
      (owner ? `Owner / DRI: ${owner}\n` : "") +
      (decidedOn ? `Decided on: ${decidedOn}\n` : "") +
      (source ? `Source: ${source}\n` : "");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          kind: mode === "new" ? "new-fact" : "correction",
          source,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-ink text-white rounded-lg px-3 py-1.5 hover:bg-stone-800 transition"
      >
        🏛️ Log a decision or update
      </button>
    );
  }

  return (
    <div className="bg-white border border-stone-300 rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-ink">Log a decision or update</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Lands in Tripti&apos;s weekly review log. Goes live in the brain on
            Monday&apos;s refresh.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-xs text-stone-400 hover:text-stone-700"
        >
          ✕
        </button>
      </div>

      {sent ? (
        <p className="text-sm text-green-700 py-3">
          ✓ Saved. Tripti picks this up at the next weekly refresh.
        </p>
      ) : (
        <>
          {/* Mode toggle */}
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setMode("new")}
              className={`px-3 py-1.5 rounded-lg border transition ${
                mode === "new"
                  ? "bg-ink text-white border-ink"
                  : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
              }`}
            >
              New decision
            </button>
            <button
              onClick={() => setMode("update")}
              className={`px-3 py-1.5 rounded-lg border transition ${
                mode === "update"
                  ? "bg-ink text-white border-ink"
                  : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
              }`}
            >
              Update to existing
            </button>
          </div>

          <Field
            label="Title"
            placeholder="e.g. Math Academy 3-attempt cap"
            value={title}
            onChange={setTitle}
            required
          />
          <Field
            label={mode === "new" ? "What was decided" : "What changed"}
            placeholder={
              mode === "new"
                ? "e.g. Cap mastery attempts at 3 per skill per day."
                : "e.g. Cap raised from 3 to 5 attempts per day."
            }
            value={decision}
            onChange={setDecision}
            required
            multiline
          />
          <Field
            label="Why (rationale)"
            placeholder="Why was this decided / changed?"
            value={rationale}
            onChange={setRationale}
            multiline
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Owner / DRI"
              placeholder="e.g. Julian Hernandez"
              value={owner}
              onChange={setOwner}
            />
            <Field
              label="Decided on"
              placeholder="e.g. 2026-04-15 or 'Apr 15 standup'"
              value={decidedOn}
              onChange={setDecidedOn}
            />
          </div>
          <Field
            label="Source"
            placeholder="link to chat / doc / meeting notes"
            value={source}
            onChange={setSource}
          />

          {error && (
            <p className="text-xs text-red-600">Couldn&apos;t send: {error}</p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="text-xs text-stone-500 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || !decision.trim() || submitting}
              className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : "Send for weekly review"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  required,
  multiline,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-stone-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-1 w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent"
        />
      )}
    </label>
  );
}
