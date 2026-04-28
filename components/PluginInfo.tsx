"use client";

import { useState } from "react";

const INSTALL_PREVIEW = `# 1. Install Claude Code (one-time, if you don't already have it):
brew install --cask claude-code

# 2. Add the Alpha Academic plugin:
claude --add-plugin alpha-academic-remote=triptikhetan-max/alpha-public

# 3. Set the API key Tripti emails you:
claude env set ALPHA_API_KEY=<your-key-here>

# 4. Start a session and try it:
claude
> /ask-alpha-academic who owns Math 6-8`;

type Status = "idle" | "submitting" | "sent" | "error";

export function PluginInfo({ userEmail }: { userEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [mode, setMode] = useState<"auto" | "manual" | null>(null);

  async function requestAccess() {
    if (!userEmail) {
      setErrorMsg("No email on session. Sign out and back in to fix.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/request-plugin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        mode?: "auto" | "manual";
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setMode(data.mode ?? "manual");
      setStatus("sent");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-white border border-stone-300 text-stone-700 rounded-lg px-3 py-1.5 hover:border-stone-400 hover:bg-stone-50 transition flex items-center gap-1.5"
      >
        💻 Get the Claude Code plugin
      </button>
    );
  }

  return (
    <div className="bg-white border border-stone-300 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-ink text-sm">
            💻 Claude Code plugin
          </h4>
          <p className="text-xs text-stone-500 mt-0.5">
            Query the brain from your terminal or VS Code instead of the
            web UI. Same data, different surface — better for chained
            questions, bulk lookups, and editor-side use.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            setStatus("idle");
            setReason("");
          }}
          className="text-xs text-stone-400 hover:text-stone-700"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {status === "sent" ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800 space-y-1">
          {mode === "auto" ? (
            <>
              <p className="font-semibold">
                ✓ Email sent to{" "}
                <code className="bg-white px-1 rounded">{userEmail}</code>.
              </p>
              <p className="text-green-700">
                Check your inbox in ~30 sec. The email has your API key + the 4
                install commands. Reply to it if anything breaks.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">
                ✓ Request logged for{" "}
                <code className="bg-white px-1 rounded">{userEmail}</code>.
              </p>
              <p className="text-green-700">
                Auto-email isn&apos;t fully wired yet — you&apos;ll get the API
                key by manual reply within a day.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
            <p className="font-semibold mb-1">🔒 We don&apos;t display the key inline</p>
            <p>
              Click below — we&apos;ll auto-email your API key + 4 install
              commands to{" "}
              <code className="bg-white px-1 rounded">{userEmail}</code>. Keys
              are rotatable if a laptop walks off.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-stone-700 block">
              What will you use it for? (optional, helps Tripti prioritize)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. I want to query the brain from VS Code while I work on AP World History QC."
              rows={2}
              className="w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-accent"
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600">{errorMsg}</p>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-stone-500">
              Will email to: <code className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-700">{userEmail ?? "(no session)"}</code>
            </p>
            <button
              onClick={requestAccess}
              disabled={status === "submitting" || !userEmail}
              className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === "submitting" ? "Sending…" : "Request API key"}
            </button>
          </div>

          <details className="text-xs text-stone-500">
            <summary className="cursor-pointer hover:text-ink">
              Preview the install steps (so you know what you&apos;re signing up for)
            </summary>
            <pre className="mt-2 bg-stone-900 text-stone-100 text-[11px] rounded-lg p-3 overflow-x-auto leading-relaxed font-mono">
              {INSTALL_PREVIEW}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
