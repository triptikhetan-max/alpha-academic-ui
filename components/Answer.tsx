"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AskResponse, MatchedDocument, MatchedNode } from "@/lib/api";

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

  // The most relevant node tells us "who to contact"
  const topDri = data.matched_nodes.find((n) => n.dri_name);

  return (
    <div className="space-y-5">
      {/* SYNTHESIZED ANSWER (when available — from /api/ask via Claude) */}
      {data.answer && <SynthesizedAnswer answer={data.answer} />}

      {/* WHAT WE KNOW (raw retrieved cards — sources for the answer above) */}
      <Section
        icon="📚"
        title={data.answer ? "Sources" : "What we know"}
      >
        {data.matched_nodes.slice(0, 2).map((n) => (
          <NodeCard key={`${n.kind}-${n.name}`} node={n} userEmail={userEmail} />
        ))}
        {data.matched_documents
          .filter((d) => d.has_content && d.content_excerpt)
          .slice(0, 2)
          .map((d, i) => (
            <DocContentQuote key={`${d.filename}-${i}`} doc={d} />
          ))}
      </Section>

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
 * Renders the AI-synthesized answer at the top of the response. Uses
 * react-markdown so `##` headings, bullet lists, tables, and emoji-prefixed
 * lines render properly.
 */
function SynthesizedAnswer({ answer }: { answer: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
        <span>🧠</span>
        <span>Answer</span>
      </div>
      <div className="prose prose-sm max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-table:my-3 prose-th:text-left prose-th:font-medium prose-th:text-stone-600 prose-td:py-1 prose-strong:text-ink prose-a:text-accent prose-a:underline prose-a:underline-offset-2 prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown>{answer}</ReactMarkdown>
      </div>
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
