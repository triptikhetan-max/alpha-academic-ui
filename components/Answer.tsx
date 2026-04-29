"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  AnswerObject,
  AskResponse,
  ConfidenceLabel,
  MatchedDocument,
  MatchedNode,
} from "@/lib/api";

/** Strip YAML frontmatter (between leading `---` markers) from a node body. */
function stripFrontmatter(text: string): string {
  if (!text) return "";
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("---")) return text;
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return text;
  return trimmed.slice(end + 4).replace(/^\s*\n/, "");
}

/**
 * Some content in the brain is wrap-corrupted: every word ends up on its own
 * paragraph because the source extraction inserted blank lines mid-sentence.
 * Detect short fragments and merge them back into flowing text so the UI is
 * actually readable.
 */
function cleanContent(text: string): string {
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n");
  // Collapse 3+ newlines down to a paragraph break
  const compacted = normalized.replace(/\n{3,}/g, "\n\n");
  const blocks = compacted.split(/\n{2,}/);
  const merged: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    if (merged.length === 0) {
      merged.push(block);
      continue;
    }
    const prev = merged[merged.length - 1];
    const blockWords = block.split(/\s+/).length;
    const prevEndsWithSentence = /[.!?:;]\s*$/.test(prev);
    const blockStartsLower = /^[a-z]/.test(block);
    const blockIsBullet = /^[-*•\d]/.test(block);
    const blockIsHeading = /^#/.test(block);
    // Merge if the fragment is short and clearly continues the previous line,
    // or if the previous line didn't terminate and this one starts lowercase.
    const shouldMerge =
      !blockIsBullet &&
      !blockIsHeading &&
      ((blockWords <= 4 && !/[.!?:]$/.test(block)) ||
        (!prevEndsWithSentence && blockStartsLower));
    if (shouldMerge) {
      merged[merged.length - 1] = prev + " " + block;
    } else {
      merged.push(block);
    }
  }
  return merged.join("\n\n");
}

/**
 * Some filenames in the brain are stored with markdown-link syntax baked in,
 * e.g. "[31035-math-academy-101.md](http://31035-math-academy-101.md)". The
 * inner pseudo-URL is fake — extract just the human-readable filename.
 */
function cleanFilename(name: string): string {
  if (!name) return "";
  const match = name.match(/^\[([^\]]+)\]\([^)]+\)$/);
  return match ? match[1] : name;
}

/**
 * Check whether a `drive_url` from the brain is a real Drive/Docs link, not
 * a pseudo-URL like `http://31035-math-academy-101.md` that some legacy data
 * carries in the markdown-link form.
 */
function isRealDriveUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/\.md(?:[/?#]|$)/i.test(url)) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  return true;
}

/**
 * Resolve the right "open" URL for a document.
 *   - Real Drive URL in the data → use it (this is the canonical case for
 *     drive-sourced docs and the indexed support-article .md files)
 *   - Otherwise (chat-only docs without Drive backing) → Drive search by
 *     filename so the user can hunt for it
 */
function resolveDocLink(
  filename: string,
  driveUrl: string | null | undefined,
): { url: string; label: string } {
  if (isRealDriveUrl(driveUrl)) {
    return { url: driveUrl!, label: "Open in Drive →" };
  }
  const clean = cleanFilename(filename);
  const searchTerm = clean.replace(/\.[^/.]+$/, "");
  return {
    url: `https://drive.google.com/drive/search?q=${encodeURIComponent(
      searchTerm,
    )}`,
    label: "Find in Drive →",
  };
}

/**
 * Some article markdown content has cross-references baked in as fake links
 * like `[31035-math-academy-101.md](http://31035-math-academy-101.md)` —
 * pseudo-URLs that go nowhere. Strip the link wrapper and keep just the text.
 */
function stripFakeMdLinks(text: string): string {
  if (!text) return "";
  return text.replace(
    /\[([^\]]+\.md)\]\(http:\/\/[^)]+\.md\)/g,
    "`$1`",
  );
}

export function Answer({
  data,
  query,
  userEmail,
}: {
  data: AskResponse;
  query: string;
  userEmail: string | null;
}) {
  if (!data.matched_nodes.length && !data.matched_documents.length) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-sm text-amber-900 space-y-3">
        <p className="font-medium">Couldn&apos;t find anything for that.</p>
        <p>A few things you can do:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Rephrase the question (be specific — &ldquo;Math 3-5&rdquo; instead
            of &ldquo;math&rdquo;).
          </li>
          <li>
            Click <strong>Flag a gap</strong> below — Tripti adds it on the
            next weekly refresh.
          </li>
          <li>
            If urgent, ping the relevant DRI directly (try asking{" "}
            <em>&ldquo;who owns &lt;subject&gt;?&rdquo;</em> first).
          </li>
        </ul>
      </div>
    );
  }

  // Split matched_nodes into FAQs (rendered prominently up top) and the rest
  // (rendered through the existing card flow). FAQs are pre-baked answers and
  // should take precedence over both synthesis and raw entity cards.
  const faqNodes = data.matched_nodes.filter((n) => n.kind === "faq");
  const nonFaqNodes = data.matched_nodes.filter((n) => n.kind !== "faq");
  const topFaq = faqNodes[0] ?? null;
  const relatedFaqs = faqNodes.slice(1);

  // The most relevant node tells us "who to contact" — prefer non-FAQ nodes
  // since FAQ entities don't carry their own DRI metadata in a useful way.
  const topDri = nonFaqNodes.find((n) => n.dri_name);

  // Brain 3: when the synthesizer abstained, the FAQ-direct-answer card is
  // misleading because the brain itself is telling us the match isn't
  // trustworthy. Hide the direct FAQ answer in that case and let the
  // abstention message speak for itself.
  const showFaqDirect = topFaq && !data.answer?.abstained;

  return (
    <div className="space-y-5">
      {/* ABSTENTION — Brain 3 explicitly says the sources don't support an
          answer. Render this BEFORE anything else so it's the first thing the
          user sees and the FAQ card gets suppressed (see showFaqDirect). */}
      {data.answer?.abstained && <AbstentionCard answer={data.answer} />}

      {/* TOP FAQ — pre-baked answer, rendered as the primary response */}
      {showFaqDirect && <FaqAnswerCard faq={topFaq!} userEmail={userEmail} />}

      {/* SYNTHESIZED ANSWER — shown below FAQ as backup when both are present;
          relabeled so users know the FAQ above is the canonical answer.
          Skipped on abstention since the AbstentionCard already covers it. */}
      {data.answer && !data.answer.abstained && (
        <SynthesizedAnswer
          answer={data.answer}
          asBackup={!!topFaq}
        />
      )}

      {/* RELATED QUESTIONS — other matched FAQ entities beyond the top one */}
      {relatedFaqs.length > 0 && (
        <Section icon="❓" title="Related questions">
          {relatedFaqs.map((n) => (
            <FaqAnswerCard
              key={`${n.kind}-${n.name}`}
              faq={n}
              userEmail={userEmail}
              compact
            />
          ))}
        </Section>
      )}

      {/* WHAT WE KNOW (raw retrieved cards — sources for the answer above).
          FAQ entities are excluded here since they're rendered above. */}
      {(nonFaqNodes.length > 0 ||
        data.matched_documents.some((d) => d.has_content && d.content_excerpt)) && (
        <Section
          icon="📚"
          title={data.answer || topFaq ? "Sources" : "What we know"}
        >
          {nonFaqNodes.slice(0, 2).map((n) => (
            <NodeCard key={`${n.kind}-${n.name}`} node={n} userEmail={userEmail} />
          ))}
          {data.matched_documents
            .filter((d) => d.has_content && d.content_excerpt)
            .slice(0, 2)
            .map((d, i) => (
              <DocContentQuote key={`${d.filename}-${i}`} doc={d} />
            ))}
        </Section>
      )}

      {/* WHO TO CONTACT */}
      {topDri && (
        <Section icon="👤" title="Who to contact">
          <DriCard dri={topDri} query={query} />
        </Section>
      )}

      {/* WHERE THE DOC IS */}
      {data.matched_documents.length > 0 && (
        <Section icon="📄" title="Where the doc is">
          <div className="space-y-2">
            {data.matched_documents.slice(0, 5).map((d, i) => (
              <DocLink key={`${d.filename}-${i}`} doc={d} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1">
        <span>{icon}</span>
        <span>{title}</span>
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * Renders the Brain 3 synthesized answer (object form). Uses react-markdown so
 * `##` headings, bullet lists, tables, and emoji-prefixed lines render properly.
 *
 * When `asBackup` is true, an FAQ entity above already provided the canonical
 * answer — relabel this block to make clear it's a fallback synthesis, not
 * the primary response.
 *
 * Confidence and review-state badges reflect the brain's per-answer trust
 * signals so the reader can tell at a glance whether the answer comes from
 * a DRI-approved source (canonical), an auto-generated FAQ, or raw search.
 */
function SynthesizedAnswer({
  answer,
  asBackup = false,
}: {
  answer: AnswerObject;
  asBackup?: boolean;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
          <span>🧠</span>
          <span>
            {asBackup
              ? "AI synthesis (in case the direct answer above is incomplete)"
              : "Answer"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ConfidenceBadge label={answer.confidence_label} />
          <ReviewStateBadge state={answer.review_state} />
        </div>
      </div>
      <div className="prose prose-sm max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-table:my-3 prose-th:text-left prose-th:font-medium prose-th:text-stone-600 prose-td:py-1 prose-strong:text-ink prose-a:text-accent prose-a:underline prose-a:underline-offset-2 prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown>{answer.text}</ReactMarkdown>
      </div>
    </div>
  );
}

/**
 * Brain 3 abstention card. Rendered when the brain explicitly says the
 * retrieved sources don't support an answer. Distinct visual treatment
 * (amber warning) so the user can't mistake it for a confident answer.
 */
function AbstentionCard({ answer }: { answer: AnswerObject }) {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800">
          <span>⚠️</span>
          <span>Not enough source evidence</span>
        </div>
        <ConfidenceBadge label={answer.confidence_label} />
      </div>
      <div className="prose prose-sm max-w-none text-amber-900">
        <ReactMarkdown>{answer.text}</ReactMarkdown>
      </div>
      <p className="text-xs text-amber-800/80 mt-3 italic">
        The brain didn&apos;t find a confident match. Try rephrasing, or use{" "}
        <strong>Suggest an edit</strong> below to flag the gap.
      </p>
    </div>
  );
}

const CONFIDENCE_STYLES: Record<ConfidenceLabel, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-stone-100 text-stone-600 border-stone-200",
};

function ConfidenceBadge({ label }: { label: ConfidenceLabel }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 ${CONFIDENCE_STYLES[label]}`}
      title={`Confidence: ${label}`}
    >
      {label} confidence
    </span>
  );
}

function ReviewStateBadge({
  state,
}: {
  state: AnswerObject["review_state"];
}) {
  if (state === "approved") {
    return (
      <span
        className="text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200"
        title="DRI-approved canonical answer"
      >
        ✅ Verified by DRI
      </span>
    );
  }
  if (state === "needs_dri") {
    return (
      <span
        className="text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200"
        title="Pending DRI review"
      >
        ⏳ Needs DRI
      </span>
    );
  }
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 bg-stone-100 text-stone-600 border-stone-200"
      title="AI-synthesized from sources"
    >
      🤖 AI generated
    </span>
  );
}

/**
 * Brain 4 (governance) badges shown on an entity card.
 *
 *   ✅ "Approved canonical answer" — appears at the top of cards whose
 *      `kind === "canonical_answer"` (DRI-blessed). Highest trust.
 *   📅 "Last reviewed: <date>"     — when the entity has both a DRI and
 *      a `last_updated` timestamp. Lets the reader see how fresh the
 *      authority is.
 *   👤 "Verified by: <DRI name>"   — when there's a DRI on the entity.
 *   ⚠️ "Stale — last reviewed N days ago" — amber, when `last_updated`
 *      is more than 90 days old. Cron / scheduled job hasn't marked
 *      it stale yet, but the user deserves the visual heads-up.
 *
 * All badges are additive and only render when the data is present —
 * existing cards keep working unchanged when the brain doesn't surface
 * these fields.
 */
function EntityProvenanceBadges({ node }: { node: MatchedNode }) {
  const isCanonical = node.kind === "canonical_answer";
  const lastReviewed = node.last_updated;
  const driName = node.dri_name;
  const ageDays = lastReviewed ? daysSince(lastReviewed) : null;
  const isStale = ageDays !== null && ageDays > 90;

  // Skip rendering entirely when nothing useful would appear.
  if (!isCanonical && !lastReviewed && !driName) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      {isCanonical && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 bg-emerald-50 text-emerald-800 border-emerald-200"
          title="DRI-authored canonical answer — highest trust"
        >
          ✅ Approved canonical answer
        </span>
      )}
      {driName && (
        <span
          className="text-[10px] font-medium text-stone-700 bg-stone-100 border border-stone-200 rounded-full px-2 py-0.5"
          title={node.dri_email ?? undefined}
        >
          👤 Verified by: {driName}
        </span>
      )}
      {lastReviewed && !isStale && (
        <span
          className="text-[10px] font-medium text-stone-700 bg-stone-100 border border-stone-200 rounded-full px-2 py-0.5"
        >
          📅 Last reviewed: {lastReviewed}
        </span>
      )}
      {lastReviewed && isStale && (
        <span
          className="text-[10px] font-semibold rounded-full border px-2 py-0.5 bg-amber-50 text-amber-800 border-amber-200"
          title={`Last reviewed ${lastReviewed}`}
        >
          ⚠️ Stale — last reviewed {ageDays} days ago
        </span>
      )}
    </div>
  );
}

/**
 * Days between an ISO date string and "today". Returns null on a
 * malformed input so the caller can skip the stale check.
 *
 * `last_updated` in the brain comes back as either "YYYY-MM-DD" or a
 * full ISO timestamp; both are accepted by `Date()`.
 */
function daysSince(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Featured card for an FAQ entity — pre-baked answer that takes precedence
 * over AI synthesis. The FAQ's `title` is the question (eyebrow); the body
 * is the markdown answer rendered with the same prose styling as
 * `SynthesizedAnswer`.
 *
 * Reuses the same /api/feedback flag flow as `NodeCard` (no DRI approval
 * loop — FAQs are auto-generated, so flagging just goes to the global
 * feedback log for Tripti to review).
 */
function FaqAnswerCard({
  faq,
  userEmail,
  compact = false,
}: {
  faq: MatchedNode;
  userEmail: string | null;
  compact?: boolean;
}) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [flagSent, setFlagSent] = useState(false);

  const cleanBody = stripFakeMdLinks(
    cleanContent(stripFrontmatter(faq.body)),
  );

  async function sendFlag() {
    if (!flagText.trim()) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          `[FLAG by ${userEmail || "anonymous"} on faq: "${faq.title}"]\n\n` +
          flagText,
        kind: "correction",
        claude_said: faq.title,
        source: faq.name,
        reported_by: userEmail,
      }),
    });
    setFlagSent(true);
    setFlagText("");
    setTimeout(() => {
      setFlagOpen(false);
      setFlagSent(false);
    }, 2500);
  }

  const headerLabel = compact ? "❓ Related question" : "🎯 Direct answer";

  return (
    <div
      className={
        compact
          ? "bg-white border border-stone-200 rounded-lg p-4"
          : "bg-white border border-stone-200 rounded-xl p-5 shadow-sm"
      }
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent mb-2">
        <span>{headerLabel}</span>
      </div>

      {/* The FAQ's title IS the question — show it as a small eyebrow caption
          above the answer body. */}
      <p className="text-sm font-medium text-stone-700 mb-3 leading-snug">
        {faq.title}
      </p>

      <div className="prose prose-sm max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-table:my-3 prose-th:text-left prose-th:font-medium prose-th:text-stone-600 prose-td:py-1 prose-strong:text-ink prose-a:text-accent prose-a:underline prose-a:underline-offset-2 prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown>{cleanBody}</ReactMarkdown>
      </div>

      {/* Footer: nightly-generated disclaimer + flag affordance */}
      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-stone-400 italic">
          auto-generated nightly · flag if wrong
        </p>
        <button
          onClick={() => setFlagOpen(!flagOpen)}
          title="Flag this answer as wrong or out of date"
          className="text-xs text-stone-400 hover:text-red-600 transition shrink-0"
        >
          🚩 Flag
        </button>
      </div>

      {flagOpen && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          {flagSent ? (
            <p className="text-xs text-green-700">
              ✓ Flagged. Tripti reviews on the next refresh.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-stone-600">
                What&apos;s wrong / what should change?
              </p>
              <textarea
                value={flagText}
                onChange={(e) => setFlagText(e.target.value)}
                placeholder="e.g. The answer cites the old DRI — should be Maya as of Apr 15."
                rows={3}
                className="w-full text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setFlagOpen(false);
                    setFlagText("");
                  }}
                  className="text-xs text-stone-500 px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={sendFlag}
                  disabled={!flagText.trim()}
                  className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-40"
                >
                  Flag for review
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NodeCard({
  node,
  userEmail,
}: {
  node: MatchedNode;
  userEmail: string | null;
}) {
  // Default-expanded when there's no summary (so users still see content);
  // default-collapsed when there IS a summary (summary is the headline).
  const [expanded, setExpanded] = useState(!node.summary);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [flagSent, setFlagSent] = useState(false);
  const cleanBody = stripFakeMdLinks(
    cleanContent(stripFrontmatter(node.body)),
  );
  const fallbackExcerpt = cleanBody.slice(0, 600);
  const cleanExcerpt =
    stripFakeMdLinks(cleanContent(stripFrontmatter(node.excerpt))) ||
    fallbackExcerpt;
  const hasMore = cleanBody.length > cleanExcerpt.length + 5;
  const visible = expanded ? cleanBody : cleanExcerpt;

  // DRI ownership detection: signed-in user's email matches the entity's DRI.
  // When true, edits go straight through (no approval). When false but the
  // entity has a DRI, the form opens a pre-filled email asking the DRI to
  // approve, with Tripti cc'd (same pattern as LogDecision).
  const isOwner = !!(
    userEmail &&
    node.dri_email &&
    userEmail.toLowerCase() === node.dri_email.toLowerCase()
  );

  async function sendFlag() {
    if (!flagText.trim()) return;
    const kind = isOwner ? "dri-direct-edit" : "correction";
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          (isOwner
            ? `[DRI DIRECT EDIT by ${userEmail} on ${node.kind}: "${node.title}"]\n\n`
            : `[FLAG by ${userEmail || "anonymous"} on ${node.kind}: "${node.title}"]\n\n`) +
          flagText,
        kind,
        claude_said: node.title,
        source: node.name,
        reported_by: userEmail,
      }),
    });

    // If user is NOT the DRI but a DRI exists, also open a pre-filled email
    // to that DRI asking for approval — same flow as LogDecision.
    if (!isOwner && node.dri_email) {
      const subject = `[Approval needed] Edit to ${node.title}`;
      const body =
        `Hi ${(node.dri_name || "").split(" ")[0] || "there"},\n\n` +
        `${userEmail || "Someone"} on the academics team proposed an edit to ${node.title} ` +
        `(${node.kind}). Since you're the DRI, you have the final say.\n\n` +
        `— — —\n` +
        `Proposed edit: ${flagText}\n` +
        `— — —\n\n` +
        `Reply ✅ Approve, ❌ Reject, or ✏️ Modify (with the corrected version).\n` +
        `Once you reply, Tripti will reflect this on the next refresh.\n\n` +
        `Thanks!\n`;
      const mailto = `mailto:${node.dri_email}?cc=tripti.khetan@trilogy.com&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
    }

    setFlagSent(true);
    setFlagText("");
    setTimeout(() => {
      setFlagOpen(false);
      setFlagSent(false);
    }, 2500);
  }

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <EntityProvenanceBadges node={node} />
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-ink">{node.title}</p>
          <p className="text-xs text-stone-500">
            {node.kind}
            {node.last_updated && ` · updated ${node.last_updated}`}
          </p>
        </div>
        <button
          onClick={() => setFlagOpen(!flagOpen)}
          title={
            isOwner
              ? "You're the DRI — edit this entry directly"
              : "Flag this entry as wrong or out of date"
          }
          className={
            isOwner
              ? "text-xs text-emerald-700 hover:text-emerald-900 transition shrink-0 font-medium"
              : "text-xs text-stone-400 hover:text-red-600 transition shrink-0"
          }
        >
          {isOwner ? "✏️ Edit (you own this)" : "🚩 Flag"}
        </button>
      </div>
      {/* AI summary takes the headline slot when available */}
      {node.summary && (
        <p className="text-sm text-stone-800 leading-relaxed bg-amber-50/40 border-l-2 border-amber-300 pl-3 py-1.5 mb-3">
          {node.summary}
        </p>
      )}
      {expanded && (
        <div className="prose-answer text-sm">
          <ReactMarkdown>{visible}</ReactMarkdown>
        </div>
      )}
      {(node.summary || hasMore) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-accent mt-2 hover:underline"
        >
          {expanded
            ? "Hide details"
            : node.summary
              ? "Show full content →"
              : "Show details →"}
        </button>
      )}

      {/* Inline edit/flag form for THIS specific entry */}
      {flagOpen && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          {flagSent ? (
            <p className="text-xs text-green-700">
              {isOwner
                ? "✓ Edit logged. Live on the next refresh (Monday)."
                : node.dri_email
                  ? `✓ Sent. Approval email opening to ${node.dri_name}, cc Tripti.`
                  : "✓ Flagged. Tripti reviews on Monday."}
            </p>
          ) : (
            <div className="space-y-2">
              {isOwner ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-xs text-emerald-900">
                  <strong>You own this entry.</strong> Your edit goes live on
                  the next refresh — no approval needed.
                </div>
              ) : node.dri_email ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
                  <strong>{node.dri_name}</strong> owns this. Submitting will
                  open a pre-filled approval email to{" "}
                  <code className="bg-white px-1 rounded">{node.dri_email}</code>{" "}
                  (cc Tripti). Goes live after they ✅.
                </div>
              ) : null}

              <p className="text-xs text-stone-600">
                {isOwner
                  ? "Describe the change:"
                  : "What's wrong / what should change?"}
              </p>
              <textarea
                value={flagText}
                onChange={(e) => setFlagText(e.target.value)}
                placeholder={
                  isOwner
                    ? "e.g. Update DRI to Maya — effective 2026-04-15. Source: Apr 15 announcement in chat."
                    : "e.g. The DRI changed last week. The new owner is Maya, see Apr 15 announcement."
                }
                rows={3}
                className="w-full text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setFlagOpen(false);
                    setFlagText("");
                  }}
                  className="text-xs text-stone-500 px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={sendFlag}
                  disabled={!flagText.trim()}
                  className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-40"
                >
                  {isOwner
                    ? "Save edit"
                    : node.dri_email
                      ? `Send to ${(node.dri_name || "DRI").split(" ")[0]}`
                      : "Flag for review"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DriCard({ dri, query }: { dri: MatchedNode; query: string }) {
  const firstName = dri.dri_name?.split(" ")[0] ?? "DRI";
  const subject = `Question about ${dri.title}`;
  const body =
    `Hi ${firstName},\n\n` +
    `I was looking up: "${query}"\n\n` +
    `Could you help with this, or point me to the right place?\n\n` +
    `Thanks!\n`;
  const mailto = dri.dri_email
    ? `mailto:${dri.dri_email}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <p className="font-medium text-ink">{dri.dri_name}</p>
      {dri.dri_email && (
        <a
          href={`mailto:${dri.dri_email}`}
          className="text-accent text-sm hover:underline"
        >
          {dri.dri_email}
        </a>
      )}
      <p className="text-xs text-stone-500 mt-1">
        {dri.kind} · {dri.title}
      </p>
      {mailto && (
        <a
          href={mailto}
          className="mt-3 inline-flex items-center gap-1.5 text-xs bg-ink text-white rounded-lg px-3 py-1.5 hover:bg-stone-800 transition"
        >
          ✉️ Ping {firstName} about this
        </a>
      )}
    </div>
  );
}

function DocContentQuote({ doc }: { doc: MatchedDocument }) {
  const [expanded, setExpanded] = useState(!doc.summary);
  const cleanName = cleanFilename(doc.filename);
  const link = resolveDocLink(doc.filename, doc.drive_url);
  const cleanedExcerpt = stripFakeMdLinks(
    cleanContent(doc.content_excerpt ?? ""),
  );

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <p className="text-sm font-medium text-ink mb-1">From: {cleanName}</p>
      <p className="text-xs text-stone-500 mb-2">
        Shared {doc.date}
        {doc.sender && ` · sender ${doc.sender.slice(-6)}`}
      </p>
      {doc.summary && (
        <p className="text-sm text-stone-800 leading-relaxed bg-amber-50/40 border-l-2 border-amber-300 pl-3 py-1.5 mb-3">
          {doc.summary}
        </p>
      )}
      {expanded && cleanedExcerpt && (
        <div className="border-l-2 border-stone-300 pl-3 text-sm text-stone-700 prose-answer">
          <ReactMarkdown>{cleanedExcerpt}</ReactMarkdown>
        </div>
      )}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {(doc.summary || cleanedExcerpt) && cleanedExcerpt && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-accent hover:underline"
          >
            {expanded
              ? "Hide quote"
              : doc.summary
                ? "Show quote →"
                : "Show details →"}
          </button>
        )}
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent hover:underline inline-block"
        >
          {link.label}
        </a>
      </div>
    </div>
  );
}

function DocLink({ doc }: { doc: MatchedDocument }) {
  const cleanName = cleanFilename(doc.filename);
  const link = resolveDocLink(doc.filename, doc.drive_url);

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3 flex items-start justify-between gap-3 hover:border-stone-300 transition">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{cleanName}</p>
        <p className="text-xs text-stone-500">
          Shared {doc.date}
          {doc.subject_tags.length > 0 && (
            <span className="ml-2">
              {doc.subject_tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="bg-stone-100 text-stone-600 rounded px-1.5 py-0.5 text-[10px] mr-1"
                >
                  {t}
                </span>
              ))}
            </span>
          )}
        </p>
      </div>
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-accent hover:underline whitespace-nowrap"
      >
        {link.label}
      </a>
    </div>
  );
}
