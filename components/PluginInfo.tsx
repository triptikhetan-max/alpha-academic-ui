"use client";

import { useState } from "react";

const INSTALL_PREVIEW = `# 1. Install Claude Code (one-time, if you don't already have it):
brew install --cask claude-code

# 2. Add the Alpha Academic plugin:
claude --add-plugin alpha-academic-remote=triptikhetan-max/alpha-public

# 3. Set the API key (auto-emailed to you):
claude env set ALPHA_API_KEY=<your-key-here>

# 4. Open Claude Code anywhere and try it:
claude
> /alpha-academic-remote:ask-alpha-academic who owns Math 6-8`;

type Status = "idle" | "submitting" | "sent" | "error";

export function PluginInfo({ userEmail }: { userEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
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
        body: JSON.stringify({}),
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
            Query the brain from <strong>anywhere Claude Code runs</strong>
            {" "}— terminal, VS Code, JetBrains, etc. Same data, more
            horsepower than the web UI. Best for chained questions and
            editor-side use.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            setStatus("idle");
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

          {errorMsg && (
            <p className="text-xs text-red-600">{errorMsg}</p>
          )}

          <div className="flex justify-end">
            <button
              onClick={requestAccess}
              disabled={status === "submitting" || !userEmail}
              className="text-sm bg-ink text-white rounded-lg px-4 py-2 hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              {status === "submitting"
                ? "Sending…"
                : `📨 Email me my API key + install steps`}
            </button>
          </div>

          <details className="text-xs text-stone-500">
            <summary className="cursor-pointer hover:text-ink">
              Preview the install (4 commands)
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
