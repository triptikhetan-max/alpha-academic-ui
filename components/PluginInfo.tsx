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
  const [inlineKey, setInlineKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
        api_key?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setMode(data.mode ?? "manual");
      setInlineKey(data.api_key ?? null);
      setStatus("sent");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore — most desktop browsers will succeed
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
            Same brain you&apos;re using on this page, but reachable from{" "}
            <strong>anywhere Claude Code runs</strong> — terminal, VS Code,
            JetBrains, etc. The point isn&apos;t more power, it&apos;s no
            context switch: if you&apos;re already working there, the brain
            is one command away.
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
        mode === "auto" ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800 space-y-1">
            <p className="font-semibold">
              ✓ Email sent to{" "}
              <code className="bg-white px-1 rounded">{userEmail}</code>.
            </p>
            <p className="text-green-700">
              Check your inbox in ~30 sec. The email has your API key + the 4
              install commands. Reply to it if anything breaks.
            </p>
          </div>
        ) : inlineKey ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-3">
            <div className="text-amber-900 leading-relaxed">
              <p className="font-semibold mb-1">
                ⚠️ Email delivery isn&apos;t fully set up yet — your key is
                shown below.
              </p>
              <p>
                Copy it now (it won&apos;t be shown again on reload). Same email
                always gets the same key, so you can come back here if you lose
                it.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                  Your API key
                </span>
                <button
                  onClick={() => copyToClipboard(inlineKey, "key")}
                  className="text-[11px] text-stone-700 hover:text-ink underline underline-offset-2"
                >
                  {copied === "key" ? "✓ copied" : "copy"}
                </button>
              </div>
              <pre className="bg-white border border-stone-200 rounded p-2 text-[11px] break-all whitespace-pre-wrap font-mono text-stone-800">
                {inlineKey}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                  Install (4 commands)
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `brew install --cask claude-code\nclaude --add-plugin alpha-academic-remote=triptikhetan-max/alpha-public\nclaude env set ALPHA_API_KEY=${inlineKey}\nclaude`,
                      "install",
                    )
                  }
                  className="text-[11px] text-stone-700 hover:text-ink underline underline-offset-2"
                >
                  {copied === "install" ? "✓ copied" : "copy all"}
                </button>
              </div>
              <pre className="bg-stone-900 text-stone-100 text-[11px] rounded p-2.5 overflow-x-auto leading-relaxed font-mono">
                {`# 1. Install Claude Code (skip if you already have it):
brew install --cask claude-code

# 2. Add the plugin:
claude --add-plugin alpha-academic-remote=triptikhetan-max/alpha-public

# 3. Set your API key:
claude env set ALPHA_API_KEY=${inlineKey}

# 4. Open Claude Code and try it:
claude
> /alpha-academic-remote:ask-alpha-academic who owns Math 6-8`}
              </pre>
            </div>

            <p className="text-[11px] text-stone-500 pt-1">
              Don&apos;t share this key externally. If a laptop walks off, ping
              Tripti — keys are rotatable.
            </p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
            <p className="font-semibold">
              ✓ Request logged for{" "}
              <code className="bg-white px-1 rounded">{userEmail}</code>.
            </p>
            <p className="text-green-700">
              Tripti will reply with your API key shortly.
            </p>
          </div>
        )
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
