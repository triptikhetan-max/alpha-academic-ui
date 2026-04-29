import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { health, type HealthResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  let h: HealthResponse | null = null;
  let healthError: string | null = null;
  try {
    h = await health();
  } catch (e) {
    healthError = (e as Error).message;
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xl">🧠</Link>
            <Link href="/" className="font-semibold text-ink hover:underline">
              Alpha Academic
            </Link>
            <span className="text-xs text-stone-400">· brain</span>
          </div>
          <Link
            href="/"
            className="text-xs text-stone-500 hover:text-ink"
          >
            ← back to ask
          </Link>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 space-y-10">
        {/* Title */}
        <section>
          <h1 className="text-3xl font-semibold text-ink mb-2">
            What's in the brain?
          </h1>
          <p className="text-stone-600 leading-relaxed">
            Everything Alpha academics knows — pulled together, indexed, and queryable.
            Refreshed weekly from our chat, live Sheets, and the support article folder.
          </p>
        </section>

        {/* Live counts */}
        {h && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
              📦 Live contents
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Documents" value={h.documents} hint="chat docs + sheets + articles" />
              <Stat label="People" value={h.nodes.people ?? 0} hint="DRIs + ops contacts" />
              <Stat label="Subjects" value={h.nodes.subjects ?? 0} hint="per grade band" />
              <Stat label="Platforms" value={h.nodes.platforms ?? 0} hint="apps + tools" />
              <Stat label="Policies" value={h.nodes.policies ?? 0} hint="rules + thresholds" />
              <Stat label="Decisions" value={h.nodes.decisions ?? 0} hint="ADRs (D1-D47)" />
              <Stat label="Campuses" value={h.nodes.campuses ?? 0} hint="DRI matrix has 50+" />
              <Stat label="Issues" value={h.nodes["systemic-issues"] ?? 0} hint="known cross-cutting" />
            </div>
            {h.generated_at && (
              <p className="text-xs text-stone-400 mt-3">
                Last brain refresh: {new Date(h.generated_at).toLocaleString()}
              </p>
            )}
          </section>
        )}

        {healthError && (
          <section className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            Couldn't load live counts: <code>{healthError}</code>
          </section>
        )}

        {/* Sections */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
            🗂 Sections
          </h2>
          <div className="space-y-3">
            <SectionRow
              icon="📖"
              title="Subjects"
              desc="Math K-2 / 3-5 / 6-8 / 9-12, Reading 3-8 / 9-12, Writing, Science, Social Studies, Language K-2 / 3-12, Vocabulary, Fast Math. Each has a primary DRI."
            />
            <SectionRow
              icon="👥"
              title="People"
              desc="Subject DRIs · Campus DRIs · Coaches · Ops · Vendors · Escalation paths."
            />
            <SectionRow
              icon="🛠"
              title="Platforms"
              desc="Math Academy, Zearn, AlphaRead, AlphaWrite, Freckle, Lalilo, Membean, VocabLoco, DreamUp, Synthesis, Math Raiders, MobyMax, ClearFluency, Egumpp, TeachTales, AlphaMath Fluency, 100-for-100, Edia, Mastery Track, Timeback UI."
            />
            <SectionRow
              icon="📜"
              title="Policies"
              desc="3-attempt cap · Bracketing · Hole filling · Mastery threshold (89.5%) · Custom plans · Pre/post-test coaching · Custom MAP growth targets (2X by Spring)."
            />
            <SectionRow
              icon="⚖️"
              title="Decisions (ADRs)"
              desc="Every 'why we chose X' with full context — D1-D47. Includes recent curriculum decisions like Freckle/Edia → AlphaMath, FastMath Showdown winners, Reading Primer adoption."
            />
            <SectionRow
              icon="🚨"
              title="Systemic issues"
              desc="Bad tests/questions · Enrollment bloat · 3-attempt cap unenforced — known cross-cutting problems."
            />
            <SectionRow
              icon="🏫"
              title="Campuses"
              desc="50+ Alpha campuses with DRIs (BTX, Austin, Miami, GT, Nova, NY, SF, SB, etc.) — per-level splits where applicable, plus a master DRI matrix."
            />
            <SectionRow
              icon="📚"
              title="Support articles"
              desc="436 articles from support.alpha.school, bucketed by topic (bracketing, coaching, app-edulastic, dash-timeback, enrollment, etc.). Each has full text + Source link."
            />
            <SectionRow
              icon="📄"
              title="Documents (chat-shared)"
              desc="1,300+ docs from the Academics Team Google Chat — every playbook, runbook, manual, sheet, and announcement, with the original Drive link preserved."
            />
          </div>
        </section>

        {/* How to query */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
            🔍 How to query
          </h2>
          <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3">
            <p className="text-sm text-stone-700">
              Just ask in plain English on the{" "}
              <Link href="/" className="text-accent underline">main page</Link>.
              The brain handles three kinds of questions:
            </p>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <QueryType
                label="Lookup"
                example="who owns Math 3-5?"
                returns="DRI name + email"
              />
              <QueryType
                label="Rule"
                example="what's the 3-attempt cap?"
                returns="exact policy + threshold"
              />
              <QueryType
                label="Procedure"
                example="how do I proctor a test?"
                returns="step-by-step playbook"
              />
            </div>
            <p className="text-xs text-stone-500 mt-2">
              Every answer surfaces three things: 📚 what we know · 👤 who to contact · 📄 where the doc is.
            </p>
          </div>
        </section>

        {/* Power user: Claude Code plugin */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
            ⚡ For power users
          </h2>
          <div className="bg-white border border-stone-200 rounded-lg p-5 text-sm space-y-3">
            <p className="text-stone-700">
              The same brain is also available as a <strong>Claude Code plugin</strong>.
              If you live in your terminal / VS Code, the plugin is faster than this UI:
              answers come directly inside your existing Claude Code session.
            </p>
            <div className="bg-stone-50 rounded p-3 font-mono text-xs space-y-1">
              <div>/plugin marketplace add triptikhetan-max/alpha-public</div>
              <div>/plugin install alpha-academic-remote@alpha-public</div>
            </div>
            <p className="text-xs text-stone-500">
              Setup guide:{" "}
              <a
                href="https://github.com/triptikhetan-max/alpha-public"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                github.com/triptikhetan-max/alpha-public
              </a>
              . You'll need an API key — DM Tripti.
            </p>
          </div>
        </section>

        {/* Update cycle */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
            🔄 How it stays current
          </h2>
          <div className="bg-white border border-stone-200 rounded-lg p-5 text-sm space-y-3">
            <p className="text-stone-700 font-medium">Auto-pulled (Tripti runs the refresh weekly):</p>
            <ul className="list-disc pl-5 space-y-1 text-stone-700">
              <li><strong>Alpha Academics Team chat</strong> — every shared playbook, manual, sheet, screenshot</li>
              <li><strong>3 live Google Sheets</strong> — Coaching DS Tracker, DRI/Campus Matrix, MAP/2X Growth Targets</li>
              <li><strong>Support articles Drive folder</strong> — 436 articles from support.alpha.school</li>
              <li><strong>brain_md/</strong> — curated subject/people/policy/decision files</li>
            </ul>
            <p className="text-stone-700 font-medium pt-2">Team-driven (you contribute):</p>
            <ul className="list-disc pl-5 space-y-1 text-stone-700">
              <li>
                <strong>Flag a gap.</strong> When the brain gets something wrong or doesn't know,
                click the <em>"Flag a gap →"</em> link below any answer. It pings Tripti.
              </li>
              <li>
                <strong>Propose a decision.</strong> When the team makes a new policy/rule, ask
                Tripti to add it as an ADR. The relevant DRI signs off before it goes live.
              </li>
              <li>
                <strong>Update DRI/policy files directly</strong> — open a PR against the private
                brain repo. CODEOWNERS auto-routes to the right reviewer.
              </li>
            </ul>
            <p className="text-xs text-stone-500 mt-3">
              Refresh runs in 3 commands; the live API is automatically updated within ~2 minutes
              of any push to GitHub. So flagged gaps land fast.
            </p>
          </div>
        </section>

        {/* Architecture */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
            🏗 Where it all lives
          </h2>
          <div className="bg-white border border-stone-200 rounded-lg p-5 text-sm">
            <pre className="text-xs text-stone-600 leading-relaxed whitespace-pre overflow-x-auto">
{`Google Chat / Live Sheets / Drive folder      brain_md/ (curated)
              │                                     │
              └──────────────┬──────────────────────┘
                             ▼
                    build_plugin.py
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
   24MB SQLite + FTS5            Claude Code plugin
   (1,759 docs indexed)          (alpha-public, gh-installed)
              │
              ▼
   Vercel API (alpha-academic-api.vercel.app)
              │
              ▼
   THIS UI (alpha-academic-ui.vercel.app)`}
            </pre>
          </div>
        </section>

        <section className="border-t border-stone-200 pt-6">
          <p className="text-xs text-stone-400">
            Built by Tripti Khetan. Refresh cadence: weekly. Last live brain build:{" "}
            {h?.generated_at ? new Date(h.generated_at).toLocaleString() : "unknown"}.
          </p>
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3">
      <div className="text-2xl font-semibold text-ink">{value.toLocaleString()}</div>
      <div className="text-xs text-stone-700 font-medium">{label}</div>
      <div className="text-[10px] text-stone-500 mt-1">{hint}</div>
    </div>
  );
}

function SectionRow({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4 flex gap-4">
      <div className="text-2xl flex-shrink-0">{icon}</div>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-stone-600 mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function QueryType({
  label,
  example,
  returns,
}: {
  label: string;
  example: string;
  returns: string;
}) {
  return (
    <div className="bg-stone-50 rounded p-3 border border-stone-100">
      <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider">{label}</div>
      <div className="text-sm text-ink italic mt-1">"{example}"</div>
      <div className="text-xs text-stone-500 mt-1">→ {returns}</div>
    </div>
  );
}
