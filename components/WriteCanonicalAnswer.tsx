"use client";

/**
 * WriteCanonicalAnswer — Phase 2 STUB component.
 *
 * Surfaces a "write the canonical answer for this question" prompt to a DRI
 * after every AI-synthesized response. When clicked, expands into a form
 * (title + question variants + markdown body) that *will* POST to
 * /api/canonical and create a new `canonical_answer` entity in vault/.
 *
 * Today this is a visual stub only:
 *   - Submit is disabled with a "Phase 2 coming next week" tooltip.
 *   - No POST happens (see TODO in handleSubmit).
 *   - Style mirrors LogDecision.tsx / Answer.tsx (bg-white, border-stone-200).
 *
 * Full schema + retrieval precedence are documented in
 * alpha-brain-v2/vault/canonical_answers/README.md.
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
  /** Signed-in user's email — becomes `authored_by` on submit. */
  userEmail: string | null;
}

export function WriteCanonicalAnswer({
  question,
  suggestedParentSlug,
  userEmail,
}: WriteCanonicalAnswerProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [questionVariants, setQuestionVariants] = useState(question);
  const [body, setBody] = useState("");

  // Phase 2 hasn't shipped — submit is locked. Tooltip explains why.
  const submitDisabled = true;
  const submitTooltip = "Phase 2 coming next week";

  function handleSubmit() {
    // TODO: POST to /api/canonical with { title, covers_questions, body,
    // parent_slug, authored_by }. The API writes the markdown file to
    // vault/canonical_answers/ and commits via the GitHub API under the DRI's
    // identity. Indexed on next nightly refresh.
    return;
  }

  if (!userEmail) {
    // Anonymous users can't author canonical answers — hide the affordance.
    return null;
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

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
        <strong>Phase 2 not yet live.</strong> The form renders, but submit is
        locked until the write API ships next week. For now, manual adds to
        <code className="bg-white px-1 rounded mx-1">
          vault/canonical_answers/
        </code>
        work end-to-end.
      </div>

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
          title={submitTooltip}
          className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Publish canonical answer
        </button>
      </div>
    </div>
  );
}
