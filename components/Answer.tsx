"use client";

import { useState } from "react";
import type { AskResponse, MatchedDocument, MatchedNode } from "@/lib/api";

export function Answer({ data }: { data: AskResponse }) {
  if (!data.matched_nodes.length && !data.matched_documents.length) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <p className="font-medium mb-1">Couldn't find anything for that.</p>
        <p>Try rephrasing, or click <strong>Flag a gap</strong> below to
        tell Tripti what's missing.</p>
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
          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <p className="font-medium text-ink">
              {topDri.dri_name}
            </p>
            {topDri.dri_email && (
              <a
                href={`mailto:${topDri.dri_email}`}
                className="text-accent text-sm hover:underline"
              >
                {topDri.dri_email}
              </a>
            )}
            <p className="text-xs text-stone-500 mt-1">
              {topDri.kind} · {topDri.title}
            </p>
          </div>
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
  const excerpt = node.excerpt || node.body.slice(0, 600);
  const hasMore = node.body.length > excerpt.length;
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
      <pre className="text-sm text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">
        {expanded ? node.body : excerpt}
      </pre>
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

function DocContentQuote({ doc }: { doc: MatchedDocument }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <p className="text-sm font-medium text-ink mb-1">
        From: {doc.filename}
      </p>
      <p className="text-xs text-stone-500 mb-2">
        Shared {doc.date}{doc.sender && ` · sender ${doc.sender.slice(-6)}`}
      </p>
      <blockquote className="border-l-2 border-stone-300 pl-3 text-sm text-stone-700 whitespace-pre-wrap">
        {doc.content_excerpt}
      </blockquote>
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
