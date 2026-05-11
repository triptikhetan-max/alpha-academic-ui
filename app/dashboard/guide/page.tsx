/**
 * /dashboard/guide — mobile action queue for guides.
 *
 * Server component. Auth + scope are enforced by the parent
 * `app/dashboard/layout.tsx` (redirects to /login on no session, "no access"
 * card on no scope). This page additionally:
 *
 *   1. Resolves the caller's functional role via `roleForScope`.
 *      - Explicit `appRole === "guide"` → show their own queue.
 *      - Heuristic: `dri` slug starts with "guide-" → treat as guide.
 *      - Otherwise (Tripti, campus DRIs in PR 3): show the same queue but
 *        unfiltered, so masters can preview the guide experience.
 *      TODO(roles): once every DRI_SCOPES entry has an `appRole`, drop the
 *      heuristic + master preview and require role=="guide".
 *
 *   2. Loads the guide queue server-side via `loadGuideQueue` so the client
 *      bundle stays small (only GuideCard is "use client").
 *
 *   3. Renders the mobile shell:
 *      ┌──────────────────────────┐
 *      │ Today                    │
 *      │ Chips: To do / Overdue / Done
 *      │ Card feed                │
 *      │ Bottom nav (fixed)       │
 *      └──────────────────────────┘
 *
 * No district-wide KPIs, no campus comparisons, no raw JSON, no model debug
 * info — those are explicitly hidden per the handoff doc.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { roleForScope, scopeForEmail } from "@/lib/dri-scopes";
import { loadGuideQueue } from "@/lib/dashboard/guideQueue";
import { GuideCard } from "@/components/dashboard/GuideCard";
import { GuideKpiChips } from "@/components/dashboard/GuideKpiChips";
import {
  GuideBottomNav,
  type GuideNavTab,
} from "@/components/dashboard/GuideBottomNav";

export const dynamic = "force-dynamic";

interface GuidePageProps {
  searchParams: Promise<{ tab?: string }>;
}

const VALID_TABS: GuideNavTab[] = ["today", "students", "done", "help"];

function resolveTab(raw: string | undefined): GuideNavTab {
  if (raw && (VALID_TABS as string[]).includes(raw)) {
    return raw as GuideNavTab;
  }
  return "today";
}

export default async function GuidePage({ searchParams }: GuidePageProps) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const scope = scopeForEmail(email);
  if (!scope) redirect("/login");

  const role = roleForScope(scope);
  // PR 3: masters & campus DRIs are allowed to preview the guide view
  // (handoff says "leave existing DRI_SCOPES entries with role=campus_dri,
  // they can still preview Guide View when at /dashboard/guide").
  const isPreviewing = role !== "guide";

  const params = await searchParams;
  const activeTab = resolveTab(params.tab);

  // PR 3 only renders the "Today" tab fully. Other tabs are placeholders.
  if (activeTab !== "today") {
    return (
      <>
        <GuideHeader scope={scope} isPreviewing={isPreviewing} />
        <main className="flex-1 px-4 py-8 text-center text-sm text-gray-500">
          {activeTab === "help" ? (
            <HelpPanel />
          ) : (
            <p>
              Coming soon. PR 3 ships the Today queue first; Students and Done
              views land next.
            </p>
          )}
        </main>
        <GuideBottomNav active={activeTab} />
      </>
    );
  }

  const queue = await loadGuideQueue({ scope });

  return (
    <>
      <GuideHeader scope={scope} isPreviewing={isPreviewing} />
      <GuideKpiChips
        toDoCount={queue.toDoCount}
        overdueCount={queue.overdueCount}
        completedTodayCount={queue.completedTodayCount}
        lastRefreshIso={queue.lastRefreshIso}
      />

      <main className="flex-1 pb-4">
        {queue.status === "data_pending" ? (
          <div className="mx-4 my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Queue not ready yet.</p>
            <p className="mt-1 opacity-90">
              {queue.message ||
                "Dashboard data hasn't been uploaded for this session. Refresh in a minute."}
            </p>
          </div>
        ) : queue.items.length === 0 ? (
          <div className="mx-4 my-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-900">
            <p className="text-lg font-semibold">Inbox zero.</p>
            <p className="mt-1 text-sm opacity-80">
              No assigned actions right now. Walk the room and check back in
              after the next refresh.
            </p>
          </div>
        ) : (
          <ul className="list-none p-0">
            {queue.items.map((action) => (
              <li key={action.id}>
                <GuideCard action={action} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <GuideBottomNav active={activeTab} />
    </>
  );
}

interface GuideHeaderProps {
  scope: { name: string; role: string };
  isPreviewing: boolean;
}

function GuideHeader({ scope, isPreviewing }: GuideHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur px-4 pb-2 pt-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold leading-tight text-gray-900">
            Today
          </h1>
          <p className="text-xs text-gray-500">{scope.name}</p>
        </div>
        <Link
          href="/dashboard/guide"
          className="min-h-[36px] rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          ↻ Refresh
        </Link>
      </div>
      {isPreviewing ? (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-amber-700">
          Preview · {scope.role}
        </p>
      ) : null}
    </header>
  );
}

function HelpPanel() {
  return (
    <div className="mx-auto max-w-prose space-y-3 text-left text-sm text-gray-700">
      <h2 className="text-base font-semibold text-gray-900">How this queue works</h2>
      <p>
        Tap <b>Start</b> when you’re heading over to the kid. Tap <b>Mark done</b>{" "}
        in two taps when the action is finished. <b>Log note</b> if anything
        unusual happened.
      </p>
      <p>
        The queue refreshes when the dashboard data refreshes. Items you mark
        done disappear from the list; you can see them under <b>Done</b>.
      </p>
      <p>
        Stuck on something? Use <b>Escalate to DRI</b> from the More menu — that
        notifies the subject DRI without losing the item.
      </p>
    </div>
  );
}
