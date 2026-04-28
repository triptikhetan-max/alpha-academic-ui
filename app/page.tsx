import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChatBox } from "@/components/ChatBox";
import { LogDecision } from "@/components/LogDecision";
import { PluginInfo } from "@/components/PluginInfo";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <h1 className="font-semibold text-ink">Alpha Academic</h1>
            <span className="text-xs text-stone-400 hidden sm:inline">
              · ask anything
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/brain"
              className="text-xs text-stone-500 hover:text-ink"
            >
              What's in the brain?
            </a>
            <span className="text-xs text-stone-500 hidden md:inline">
              {session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="text-xs text-stone-500 hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 space-y-6">
        {/* What is this? — top intro */}
        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-ink mb-2">What is this?</h2>
            <p className="text-sm text-stone-700 leading-relaxed">
              A web window into the <strong>Alpha Academic Brain</strong> — a
              team-curated knowledge base of everything we know as an academics
              team. Ask anything here for a quick answer; the data comes from
              our actual playbooks, decisions, DRIs, and shared docs.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-stone-700 leading-relaxed space-y-2">
            <p className="font-semibold text-stone-900">
              ⚡ This UI is the quick-lookup surface — the{" "}
              <em>Claude Code plugin</em> is the real workhorse.
            </p>
            <p>
              The plugin gives you the same brain inside your terminal or VS
              Code: chain questions, do bulk lookups across subjects/people,
              run it while you&apos;re actually working on QC or curriculum. If
              you&apos;ll use the brain more than a couple times a week, get
              the plugin.
            </p>
            <p className="pt-1">
              <PluginInfo userEmail={session.user.email ?? null} />
            </p>
          </div>
        </section>

        {/* What's in it */}
        <section className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="font-semibold text-ink mb-2">What&apos;s in the brain?</h2>
          <p className="text-sm text-stone-700 leading-relaxed mb-4">
            <strong>1,560 entities indexed</strong> — pulled from our team chat,
            shared Drive docs, live Sheets, and curated by Tripti. AI-summarized
            for fast scanning. Refreshed weekly.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {[
              ["14", "subjects"],
              ["20", "platforms"],
              ["34", "people / DRIs"],
              ["75", "decisions (ADRs)"],
              ["8", "policies"],
              ["13", "campuses"],
              ["1,396", "supporting docs"],
              ["1,191", "AI summaries"],
            ].map(([n, label]) => (
              <div
                key={label}
                className="bg-stone-50 border border-stone-200 rounded-lg p-3"
              >
                <p className="font-semibold text-ink text-base">{n}</p>
                <p className="text-stone-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-stone-500 mt-4">
            Want the full structure?{" "}
            <a href="/brain" className="text-accent underline">
              Browse what&apos;s in the brain →
            </a>
          </p>
        </section>

        {/* Every answer gives 3 things */}
        <section className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="font-semibold text-ink mb-2">Every answer gives you 3 things</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
              <p className="font-semibold text-ink mb-1">📚 What we know</p>
              <p className="text-stone-600 leading-relaxed">
                AI summary at the top, then quoted content from real playbooks,
                policies, and ADRs.
              </p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
              <p className="font-semibold text-ink mb-1">👤 Who to contact</p>
              <p className="text-stone-600 leading-relaxed">
                DRI name + their actual email, plus a one-click <em>Ping</em>{" "}
                button that drafts the email.
              </p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
              <p className="font-semibold text-ink mb-1">📄 Where the doc is</p>
              <p className="text-stone-600 leading-relaxed">
                Direct link to the original Drive doc, sheet, or article.
              </p>
            </div>
          </div>
        </section>

        {/* How updates happen — anyone can edit */}
        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <div>
            <h2 className="font-semibold text-ink mb-2">
              The brain is yours — anyone can improve it
            </h2>
            <p className="text-sm text-stone-700 leading-relaxed">
              Every entry in the brain is a markdown file in a GitHub repo. You
              don&apos;t need to install Obsidian or anything else. Edit in the
              browser, commit, done. Tripti reviews weekly; updates ship every
              Monday.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-1.5">
              <p className="font-semibold text-ink">
                🛠️ Fix something quickly
              </p>
              <p className="text-stone-600 leading-relaxed">
                Click <strong>🚩 Flag</strong> on any card, or{" "}
                <strong>Suggest an edit</strong> below an answer. Lands in the
                weekly review log; goes live Monday.
              </p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-1.5">
              <p className="font-semibold text-ink">
                🏛️ Log a new decision
              </p>
              <p className="text-stone-600 leading-relaxed">
                Use the button below. Sends a pre-filled approval email to the{" "}
                <strong>subject DRI</strong> (so they&apos;re in the loop). Goes
                live Monday once they ✅.
              </p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-1.5">
              <p className="font-semibold text-ink">
                ✏️ Edit markdown directly (open to PRs)
              </p>
              <p className="text-stone-600 leading-relaxed">
                Open the{" "}
                <a
                  href="https://github.com/triptikhetan-max/alpha-brain-v2/tree/main/vault"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  brain repo on GitHub
                </a>
                . Click any file. Pencil icon. Edit. Commit — or open a pull
                request for bigger changes. No install needed.
              </p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-1.5">
              <p className="font-semibold text-ink">
                ↩️ Disagree with an answer?
              </p>
              <p className="text-stone-600 leading-relaxed">
                Reply directly to the relevant{" "}
                <strong>DRI&apos;s email</strong> — every answer surfaces it.
                They own the truth for their domain.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <LogDecision />
          </div>
        </section>

        <ChatBox userEmail={session.user.email ?? null} />
      </div>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 text-xs text-stone-500 flex flex-wrap gap-4 justify-between">
          <span>
            1,560 entities · refreshed weekly from chat + Sheets + Drive
          </span>
          <span>
            Built by{" "}
            <a
              href="mailto:tripti.khetan@trilogy.com"
              className="text-stone-600 hover:text-ink"
            >
              Tripti
            </a>
            {" · "}
            <a
              href="https://github.com/triptikhetan-max/alpha-brain-v2"
              target="_blank"
              rel="noreferrer"
              className="text-stone-600 hover:text-ink"
            >
              brain repo
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}
