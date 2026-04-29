"use client";

/**
 * WriteCanonicalAnswer (Brain 4 wiring).
 *
 * Surfaces a "write the canonical answer for this question" prompt to a DRI
 * after every AI-synthesized response. When clicked, expands into a form
 * (title + question variants + markdown body) that POSTs to
 * `/api/canonical`. That route proxies into the brain's `/review` +
 * `/review/{id}/approve` flow, which (a) records the review row and
 * (b) materialises a canonical_answer markdown file via
 * `_materialize_canonical_answer`. See vault/canonical_answers/README.md
 * for the full schema + retrieval precedence.
 *
 * Phase B (still to come): the markdown file is written to /tmp on
 * Vercel. A follow-up commits it back to the vault via the GitHub API
 * so it survives the next deploy.
 */

import { useState } from "react";

interface WriteCanonicalAnswerProps {
  /** The question the user just asked — pre-fills the first question variant. */
  question: string;
  /**
   * Slug of the parent entity (policy/subject/decision/etc.) that this
   * canonical answer is about. Pre-filled from whichever node was the top
   * match for `question`. Optional because the user can override it.
   */
  suggestedParentSlug?: string;
  /**
   * Kind of the parent entity. Defaults to "policy" — a safe choice when
   * we don't know better, since the brain validates parent_kind values
   * server-side anyway.
   */
  suggestedParentKind?:
    | "subject"
    | "policy"
    | "decision"
    | "person"
    | "platform"
    | "topic"
    | "campus";
  /** Signed-in user's email — becomes `authored_by` on submit. */
  userEmail: string | null;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; slug: string; reviewId: string }
  | { kind: "error"; message: string };

export function WriteCanonicalAnswer({
  question,
  suggestedParentSlug,
  suggestedParentKind = "policy",
  userEmail,
}: WriteCanonicalAnswerProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [questionVariants, setQuestionVariants] = useState(question);
  const [body, setBody] = useState("");
  const [parentSlug, setParentSlug] = useState(suggestedParentSlug ?? "");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  if (!userEmail) {
    // Anonymous users can't author canonical answers — hide the affordance.
    return null;
  }

  const submitDisabled =
    submitState.kind === "submitting" ||
    !title.trim() ||
    !questionVariants.trim() ||
    !body.trim() ||
    !parentSlug.trim();

  async function handleSubmit() {
    if (submitDisabled) return;
    setSubmitState({ kind: "submitting" });

    const variants = questionVariants
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);
    if (variants.length === 0) {
      setSubmitState({
        kind: "error",
        message: "At least one question variant is required.",
      });
      return;
    }

    try {
      const res = await fetch("/api/canonical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          covers_questions: variants,
          body: body.trim(),
          parent_slug: parentSlug.trim(),
          parent_kind: suggestedParentKind,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmitState({
          kind: "error",
          message: data.error || `HTTP ${res.status}`,
        });
        return;
      }
      setSubmitState({
        kind: "success",
        slug: data.slug,
        reviewId: data.reviewId,
      });
    } catch (err) {
      setSubmitState({
        kind: "error",
        message: (err as Error).message,
      });
    }
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          onClick={() => {
            setOpen(true);
            // Pre-fill the question variants textarea with the user's question
            // so the DRI doesn't have to retype it.
            if (!questionVariants) setQuestionVariants(question);
          }}
          className="text-xs bg-white border border-stone-300 text-ink rounded-lg px-3 py-1.5 hover:border-stone-500 transition"
        >
          📝 Write the canonical answer for this question
        </button>
        <p className="text-xs text-stone-500 mt-1.5">
          You&apos;re the DRI. A 2-minute answer from you replaces the AI&apos;s
          guess for everyone who asks this from now on.
        </p>
      </div>
    );
  }

  if (submitState.kind === "success") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 shadow-sm space-y-2">
        <p className="font-semibold text-emerald-900">
          ✅ Canonical answer published
        </p>
        <p className="text-xs text-emerald-800">
          Slug: <code className="bg-white px-1 rounded">{submitState.slug}</code>
          <br />
          Review id:{" "}
          <code className="bg-white px-1 rounded">{submitState.reviewId}</code>
        </p>
        <p className="text-xs text-emerald-700">
          The brain has recorded your approval. The markdown file lands in
          the vault on the next deploy (best-effort write to /tmp on Vercel —
          see HANDOVER.md for the full git-write Phase B plan).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-ink">Write the canonical answer</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Replaces the AI synthesis for everyone who asks any of the
            question variants below.
            {suggestedParentSlug && (
              <>
                {" "}
                Tagged to <code className="bg-stone-100 px-1 rounded">
                  {suggestedParentSlug}
                </code>.
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-stone-400 hover:text-stone-700"
        >
          ✕
        </button>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-stone-700">
          Title <span className="text-red-600">*</span>
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Math Academy 3-attempt cap policy"
          className="mt-1 w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-stone-700">
          Parent slug <span className="text-red-600">*</span>
        </span>
        <span className="block text-[11px] text-stone-500 mt-0.5">
          Slug of the existing entity this answer is about (e.g. <code>math-6-8</code>).
        </span>
        <input
          type="text"
          value={parentSlug}
          onChange={(e) => setParentSlug(e.target.value)}
          placeholder={suggestedParentSlug ?? "math-6-8"}
          className="mt-1 w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent font-mono"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-stone-700">
          Question variants <span className="text-red-600">*</span>
        </span>
        <span className="block text-[11px] text-stone-500 mt-0.5">
          One question per line. All of these will be answered by this entry.
        </span>
        <textarea
          value={questionVariants}
          onChange={(e) => setQuestionVariants(e.target.value)}
          placeholder={
            "What is the 3-attempt cap policy?\nHow many attempts do students get?\nWhat happens after 3 failed attempts?"
          }
          rows={4}
          className="mt-1 w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent font-mono"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-stone-700">
          Answer (markdown) <span className="text-red-600">*</span>
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            "# Heading\n\nWrite the canonical answer here. ~150 words is the sweet spot.\n\nBe precise about edge cases. Cite dates when relevant."
          }
          rows={10}
          className="mt-1 w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent font-mono"
        />
      </label>

      {submitState.kind === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900">
          {submitState.message}
        </div>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-stone-500 px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitDisabled}
          className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitState.kind === "submitting"
            ? "Publishing…"
            : "Publish canonical answer"}
        </button>
      </div>
    </div>
  );
}
