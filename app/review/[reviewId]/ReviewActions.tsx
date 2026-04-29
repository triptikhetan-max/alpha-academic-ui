"use client";

/**
 * The DRI's three action buttons on the review page:
 *   ✅ Approve              — rubber-stamp the proposed answer
 *   ✏️ Approve with correction  — opens an inline markdown textarea
 *                                  whose contents become the canonical
 *                                  answer body
 *   ❌ Reject                — opens a textarea for the rejection reason
 *
 * On any successful action we replace the panel with a confirmation +
 * "back to ask" link, since the brain has already transitioned the row
 * and a fresh GET on this URL would render the terminal state anyway.
 *
 * All three POSTs go through `/api/review/[id]/...` server routes (which
 * inject the session email as the actor), not directly to the brain. That
 * way the only way to act on this review is to be signed in via NextAuth.
 */

import { useState } from "react";

interface Props {
  reviewId: string;
  proposedAnswer: string;
}

type Mode = "idle" | "correction" | "reject" | "saving" | "done";

export function ReviewActions({ reviewId, proposedAnswer }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [correction, setCorrection] = useState(proposedAnswer);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<{ kind: string; status: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; status?: string; error?: string }> {
    const res = await fetch(`/api/review/${encodeURIComponent(reviewId)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: data.review?.status };
  }

  async function approvePlain() {
    setMode("saving");
    setError(null);
    const r = await post("approve", {});
    if (r.ok) {
      setDone({ kind: "approved", status: r.status ?? "approved" });
      setMode("done");
    } else {
      setError(r.error ?? "approve failed");
      setMode("idle");
    }
  }

  async function approveWithCorrection() {
    if (!correction.trim()) {
      setError("Correction text is required.");
      return;
    }
    setMode("saving");
    setError(null);
    const r = await post("approve", { correction });
    if (r.ok) {
      setDone({ kind: "approved-with-correction", status: r.status ?? "approved" });
      setMode("done");
    } else {
      setError(r.error ?? "approve failed");
      setMode("correction");
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setMode("saving");
    setError(null);
    const r = await post("reject", { reason });
    if (r.ok) {
      setDone({ kind: "rejected", status: r.status ?? "rejected" });
      setMode("done");
    } else {
      setError(r.error ?? "reject failed");
      setMode("reject");
    }
  }

  if (mode === "done" && done) {
    const message =
      done.kind === "approved"
        ? "Approved. The proposed change has been blessed."
        : done.kind === "approved-with-correction"
          ? "Approved with correction. A canonical answer is being materialized."
          : "Rejected. The proposer will see your reason.";
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-sm text-emerald-900">
        <p className="font-medium">{message}</p>
        <p className="text-xs mt-2">
          Status: <code>{done.status}</code>
        </p>
        <a
          href="/"
          className="inline-block mt-3 text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800"
        >
          ← back to ask
        </a>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
        🧑‍⚖️ Your decision
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900">
          {error}
        </div>
      )}

      {mode === "idle" && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => setMode("reject")}
            className="text-sm bg-white border border-red-300 text-red-700 rounded-lg px-3 py-2 hover:bg-red-50"
          >
            ❌ Reject
          </button>
          <button
            onClick={() => {
              setMode("correction");
              setCorrection(proposedAnswer);
            }}
            className="text-sm bg-white border border-stone-300 text-ink rounded-lg px-3 py-2 hover:border-stone-500"
          >
            ✏️ Approve with correction
          </button>
          <button
            onClick={approvePlain}
            className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-2 hover:bg-emerald-700"
          >
            ✅ Approve
          </button>
        </div>
      )}

      {mode === "correction" && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-stone-600">
            Edit the answer the brain will publish. Markdown is fine — this
            becomes a canonical answer indexed on the next refresh.
          </p>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={10}
            className="w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent font-mono"
            placeholder="The corrected answer in markdown..."
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setMode("idle")}
              className="text-xs text-stone-500 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={approveWithCorrection}
              className="text-xs bg-emerald-600 text-white rounded px-3 py-1.5 hover:bg-emerald-700"
            >
              ✅ Approve with correction
            </button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-stone-600">
            Why are you rejecting this? The proposer (and Tripti) will see this.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            className="w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent"
            placeholder="e.g. The DRI changed last week — the proposer's source was outdated."
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setMode("idle")}
              className="text-xs text-stone-500 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={reject}
              className="text-xs bg-red-600 text-white rounded px-3 py-1.5 hover:bg-red-700"
            >
              ❌ Confirm reject
            </button>
          </div>
        </div>
      )}

      {mode === "saving" && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-xs text-stone-600">
          Saving…
        </div>
      )}
    </section>
  );
}
