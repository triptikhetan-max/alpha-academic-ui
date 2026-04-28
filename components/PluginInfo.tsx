"use client";

import { useState } from "react";

const PLUGIN_API_KEY = "E2NHK7ClezaDwyR9i3-BXIqoeR1swmCzJEZI8K4OrFo";

const INSTALL_STEPS = `# 1. Install Claude Code (one-time, if you don't already have it):
brew install --cask claude-code

# 2. Add the Alpha Academic plugin:
claude --add-plugin alpha-academic-remote=triptikhetan-max/alpha-public

# 3. Set your API key (same one for everyone on the team):
claude env set ALPHA_API_KEY=${PLUGIN_API_KEY}

# 4. Start a session and try it:
claude
> /ask-alpha-academic who owns Math 6-8`;

export function PluginInfo() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"key" | "all" | null>(null);

  function copyKey() {
    navigator.clipboard.writeText(PLUGIN_API_KEY);
    setCopied("key");
    setTimeout(() => setCopied(null), 1500);
  }

  function copyAll() {
    navigator.clipboard.writeText(INSTALL_STEPS);
    setCopied("all");
    setTimeout(() => setCopied(null), 1500);
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
            web UI. Same data, different surface.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-stone-400 hover:text-stone-700"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium text-stone-700">
          Your shared API key (same for everyone on the team):
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[11px] font-mono bg-white border border-stone-200 rounded px-2 py-1.5 text-stone-700 truncate">
            {PLUGIN_API_KEY}
          </code>
          <button
            onClick={copyKey}
            className="text-xs bg-ink text-white rounded px-3 py-1.5 hover:bg-stone-800 transition shrink-0"
          >
            {copied === "key" ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <p className="text-[11px] text-stone-500">
          Don&apos;t share this externally. It&apos;s gated to{" "}
          @alpha.school / @trilogy.com / @2hourlearning.com domains.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-stone-700">
            Install (4 commands):
          </p>
          <button
            onClick={copyAll}
            className="text-xs text-accent hover:underline"
          >
            {copied === "all" ? "✓ Copied" : "Copy all"}
          </button>
        </div>
        <pre className="bg-stone-900 text-stone-100 text-[11px] rounded-lg p-3 overflow-x-auto leading-relaxed font-mono">
          {INSTALL_STEPS}
        </pre>
      </div>

      <p className="text-xs text-stone-500 leading-relaxed">
        Stuck on install? See the{" "}
        <a
          href="https://github.com/triptikhetan-max/alpha-public#installation"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          install guide on GitHub
        </a>
        {" "}or open an issue on the repo.
      </p>
    </div>
  );
}
