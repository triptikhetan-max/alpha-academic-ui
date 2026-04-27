"use client";

import { useState } from "react";

type Mode = "new" | "update";

export function LogDecision() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("new");
  const [title, setTitle] = useState("");
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [driName, setDriName] = useState("");
  const [driEmail, setDriEmail] = useState("");
  const [decidedOn, setDecidedOn] = useState("");
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDecision("");
    setRationale("");
    setDriName("");
    setDriEmail("");
    setDecidedOn("");
    setSource("");
    setSent(false);
    setError(null);
  }

  function buildApprovalMailto(): string {
    const subject =
      `[Approval needed] ${mode === "new" ? "New decision" : "Update"}: ${title}`;
    const body =
      `Hi ${driName.split(" ")[0] || "there"},\n\n` +
      `Someone on the Alpha Academic team proposed ${mode === "new" ? "a new decision" : "an update"} that's in your area of ownership and needs your sign-off before it goes into the team's brain.\n\n` +
      `— — —\n` +
      `Title: ${title}\n` +
      `${mode === "new" ? "Decision" : "Change"}: ${decision}\n` +
      (rationale ? `Why: ${rationale}\n` : "") +
      (decidedOn ? `Decided on: ${decidedOn}\n` : "") +
      (source ? `Source: ${source}\n` : "") +
      `— — —\n\n` +
      `Reply ✅ Approve, ❌ Reject, or ✏️ Modify (with the corrected version).\n\n` +
      `Once you reply, Tripti will add this to the brain on the next weekly refresh.\n\n` +
      `Thanks!\n`;
    return `mailto:${driEmail}?cc=tripti.khetan@trilogy.com&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function submit() {
    if (!title.trim() || !decision.trim() || !driEmail.trim()) return;
    setSubmitting(true);
    setError(null);
    const message =
      `[${mode === "new" ? "NEW DECISION (pending DRI approval)" : "UPDATE TO DECISION (pending DRI approval)"}] ${title}\n\n` +
      `${mode === "new" ? "Decision" : "Change"}: ${decision}\n` +
      (rationale ? `Why: ${rationale}\n` : "") +
      `Pending approval from: ${driName || driEmail} <${driEmail}>\n` +
      (decidedOn ? `Decided on: ${decidedOn}\n` : "") +
      (source ? `Source: ${source}\n` : "");
    try {
      // 1. Log the proposal to Tripti's weekly queue (status: pending DRI approval)
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

      // 2. Open the user's mail client with a pre-filled approval request to the DRI
      window.location.href = buildApprovalMailto();

      setSent(true);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          onClick={() => setOpen(true)}
          className="text-xs bg-ink text-white rounded-lg px-3 py-1.5 hover:bg-stone-800 transition"
        >
          🏛️ Log a decision or update
        </button>
        <p className="text-xs text-stone-500 mt-1.5">
          Sends a pre-filled approval email to the <strong>subject DRI</strong>
          {" "}(cc&apos;d to Tripti). After they approve, it goes into the brain
          on Monday&apos;s refresh.
        </p>
      </div>
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
        <div className="text-sm text-green-700 py-3 space-y-1">
          <p>✓ Logged to Tripti&apos;s queue and opening your email client.</p>
          <p className="text-xs text-green-600">
            Send the pre-filled approval request to {driName || driEmail}. Once
            they reply with ✅, Tripti will add it to the brain on Monday.
          </p>
        </div>
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
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-3">
            <p className="text-xs text-stone-600">
              <strong className="text-stone-800">DRI approval required.</strong>{" "}
              The owner of this area gets a pre-filled email to approve, reject,
              or modify. Tripti is cc&apos;d.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="DRI name"
                placeholder="e.g. Julian Hernandez"
                value={driName}
                onChange={setDriName}
              />
              <Field
                label="DRI email"
                placeholder="julian@alpha.school"
                value={driEmail}
                onChange={setDriEmail}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Decided on"
              placeholder="e.g. 2026-04-15 or 'Apr 15 standup'"
              value={decidedOn}
              onChange={setDecidedOn}
            />
            <Field
              label="Source"
              placeholder="link to chat / doc / meeting"
              value={source}
              onChange={setSource}
            />
          </div>

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
              disabled={
                !title.trim() ||
                !decision.trim() ||
                !driEmail.trim() ||
                submitting
              }
              className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Sending…" : "Send to DRI for approval"}
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
