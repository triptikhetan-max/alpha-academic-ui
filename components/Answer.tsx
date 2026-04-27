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

export function Answer({
  data,
  query,
}: {
  data: AskResponse;
  query: string;
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
      {/* WHAT WE KNOW */}
      <Section icon="📚" title="What we know">
        {data.matched_nodes.slice(0, 2).map((n) => (
          <NodeCard key={`${n.kind}-${n.name}`} node={n} />
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

function NodeCard({ node }: { node: MatchedNode }) {
  const [expanded, setExpanded] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [flagSent, setFlagSent] = useState(false);
  const cleanBody = stripFrontmatter(node.body);
  const fallbackExcerpt = cleanBody.slice(0, 600);
  const cleanExcerpt = stripFrontmatter(node.excerpt) || fallbackExcerpt;
  const hasMore = cleanBody.length > cleanExcerpt.length + 5;
  const visible = expanded ? cleanBody : cleanExcerpt;

  async function sendFlag() {
    if (!flagText.trim()) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[FLAG on ${node.kind}: "${node.title}"]\n\n${flagText}`,
        kind: "correction",
        claude_said: node.title,
        source: node.name,
      }),
    });
    setFlagSent(true);
    setFlagText("");
    setTimeout(() => {
      setFlagOpen(false);
      setFlagSent(false);
    }, 2000);
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
          title="Flag this entry as wrong or out of date"
          className="text-xs text-stone-400 hover:text-red-600 transition shrink-0"
        >
          🚩 Flag
        </button>
      </div>
      <div className="prose-answer text-sm">
        <ReactMarkdown>{visible}</ReactMarkdown>
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-accent mt-2 hover:underline"
        >
          {expanded ? "Show less" : "Show full content"}
        </button>
      )}

      {/* Inline flag form for THIS specific entry */}
      {flagOpen && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          {flagSent ? (
            <p className="text-xs text-green-700">
              ✓ Flagged. Tripti reviews on Monday.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-stone-600">
                What&apos;s wrong with{" "}
                <strong>&ldquo;{node.title}&rdquo;</strong>?
              </p>
              <textarea
                value={flagText}
                onChange={(e) => setFlagText(e.target.value)}
                placeholder="e.g. The DRI changed last week. The new owner is Maya, see Apr 15 announcement."
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
                  Send to Tripti
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
  const cleanName = cleanFilename(doc.filename);
  const driveSearchUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(
    cleanName.replace(/\.[^/.]+$/, ""),
  )}`;
  const linkUrl = isRealDriveUrl(doc.drive_url) ? doc.drive_url! : driveSearchUrl;
  const linkLabel = isRealDriveUrl(doc.drive_url)
    ? "Open original →"
    : "Find original in Drive →";

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <p className="text-sm font-medium text-ink mb-1">From: {cleanName}</p>
      <p className="text-xs text-stone-500 mb-2">
        Shared {doc.date}
        {doc.sender && ` · sender ${doc.sender.slice(-6)}`}
      </p>
      <div className="border-l-2 border-stone-300 pl-3 text-sm text-stone-700 prose-answer">
        <ReactMarkdown>{doc.content_excerpt ?? ""}</ReactMarkdown>
      </div>
      <a
        href={linkUrl}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-accent hover:underline mt-2 inline-block"
      >
        {linkLabel}
      </a>
    </div>
  );
}

function DocLink({ doc }: { doc: MatchedDocument }) {
  const cleanName = cleanFilename(doc.filename);
  // If we don't have a real Drive URL, fall back to Drive search by filename
  const driveSearchUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(
    cleanName.replace(/\.[^/.]+$/, ""),
  )}`;
  const linkUrl = isRealDriveUrl(doc.drive_url) ? doc.drive_url! : driveSearchUrl;
  const linkLabel = isRealDriveUrl(doc.drive_url) ? "Open →" : "Find in Drive →";

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
        href={linkUrl}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-accent hover:underline whitespace-nowrap"
      >
        {linkLabel}
      </a>
    </div>
  );
}
