"use client";

import { useState } from "react";
import type { AskResponse } from "@/lib/api";
import { Answer } from "./Answer";

const SAMPLE_QUERIES = [
  "Who owns Math 3-5?",
  "How do I proctor a mastery test?",
  "Why is reading missing during bracketing?",
  "What's the 3-attempt cap policy?",
  "Where's the Alpha Mastery Targets sheet?",
  "What did we decide about Math Academy penalties?",
];

export function ChatBox({ userEmail }: { userEmail?: string | null }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  async function submit(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    setFeedbackOpen(false);
    setFeedbackSent(false);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `API ${res.status}`);
      }
      const result: AskResponse = await res.json();
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback() {
    if (!feedbackText.trim()) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: feedbackText,
        kind: "correction",
        claude_said: query,
      }),
    });
    setFeedbackSent(true);
    setFeedbackText("");
    setTimeout(() => setFeedbackOpen(false), 1500);
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
      >
        <div className="bg-white border border-stone-200 rounded-xl shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(query);
              }
            }}
            placeholder="Ask anything about Alpha academics — DRIs, policies, playbooks, decisions, where docs live..."
            rows={3}
            className="w-full resize-none px-4 py-3 bg-transparent outline-none text-sm placeholder:text-stone-400"
          />
          <div className="flex justify-between items-center px-4 py-2 border-t border-stone-100">
            <p className="text-xs text-stone-400">⏎ to send · ⇧⏎ for newline</p>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-ink text-white text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? "Thinking…" : "Ask"}
            </button>
          </div>
        </div>
      </form>

      {/* Sample chips (only when nothing else is showing) */}
      {!data && !loading && !error && (
        <div>
          <p className="text-xs text-stone-500 mb-2">Try one of these:</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_QUERIES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQuery(s);
                  submit(s);
                }}
                className="text-xs bg-white border border-stone-200 rounded-full px-3 py-1.5 text-stone-700 hover:border-stone-400 transition"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div className="space-y-2">
          <div className="h-4 bg-stone-200 rounded animate-pulse w-1/4" />
          <div className="h-20 bg-stone-100 rounded-lg animate-pulse" />
          <div className="h-32 bg-stone-100 rounded-lg animate-pulse" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          <p className="font-medium mb-1">Something broke.</p>
          <p className="font-mono text-xs">{error}</p>
        </div>
      )}

      {/* Answer */}
      {data && !loading && (
        <>
          <Answer data={data} query={query} userEmail={userEmail ?? null} />

          {/* Edit / flag-a-gap panel */}
          <div className="border-t border-stone-200 pt-4">
            {!feedbackOpen ? (
              <div className="text-xs text-stone-500 space-y-1">
                <p>
                  <button
                    onClick={() => setFeedbackOpen(true)}
                    className="text-stone-700 hover:text-ink underline font-medium"
                  >
                    Wrong, missing, or out of date? Suggest an edit →
                  </button>
                </p>
                <p className="text-stone-400">
                  Edits and gaps land in Tripti&apos;s weekly review log. The
                  brain refreshes every Monday.
                </p>
              </div>
            ) : feedbackSent ? (
              <p className="text-xs text-green-700">
                ✓ Sent. Tripti will pick this up in the weekly refresh.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-stone-600">
                  <strong>What&apos;s wrong, missing, or should change?</strong>{" "}
                  Tell me as much as you can: the correct answer, the source
                  doc, the right DRI — anything helps Tripti fix it.
                </p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder={`Example:\nThe DRI for Math 6-8 is now Maya, not Julian — see Apr 15 announcement in chat.`}
                  rows={5}
                  className="w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setFeedbackOpen(false);
                      setFeedbackText("");
                    }}
                    className="text-xs text-stone-500 px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendFeedback}
                    disabled={!feedbackText.trim()}
                    className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-40"
                  >
                    Send for weekly review
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
