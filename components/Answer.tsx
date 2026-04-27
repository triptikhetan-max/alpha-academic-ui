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
  const cleanBody = stripFrontmatter(node.body);
  const fallbackExcerpt = cleanBody.slice(0, 600);
  const cleanExcerpt = stripFrontmatter(node.excerpt) || fallbackExcerpt;
  const hasMore = cleanBody.length > cleanExcerpt.length + 5;
  const visible = expanded ? cleanBody : cleanExcerpt;

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div>
          <p className="font-medium text-ink">{node.title}</p>
          <p className="text-xs text-stone-500">
            {node.kind}
            {node.last_updated && ` · updated ${node.last_updated}`}
          </p>
        </div>
      </div>
      <div className="prose-answer text-sm text-stone-700">
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
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <p className="text-sm font-medium text-ink mb-1">
        From: {doc.filename}
      </p>
      <p className="text-xs text-stone-500 mb-2">
        Shared {doc.date}
        {doc.sender && ` · sender ${doc.sender.slice(-6)}`}
      </p>
      <div className="border-l-2 border-stone-300 pl-3 text-sm text-stone-700 prose-answer">
        <ReactMarkdown>{doc.content_excerpt ?? ""}</ReactMarkdown>
      </div>
      {doc.drive_url && (
        <a
          href={doc.drive_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent hover:underline mt-2 inline-block"
        >
          Open original →
        </a>
      )}
    </div>
  );
}

function DocLink({ doc }: { doc: MatchedDocument }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3 flex items-start justify-between gap-3 hover:border-stone-300 transition">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{doc.filename}</p>
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
      {doc.drive_url ? (
        <a
          href={doc.drive_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent hover:underline whitespace-nowrap"
        >
          Open →
        </a>
      ) : (
        <span className="text-xs text-stone-400">no link</span>
      )}
    </div>
  );
}
