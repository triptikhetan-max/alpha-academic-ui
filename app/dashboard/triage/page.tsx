/**
 * /dashboard/triage — clean Triage view (PR 2 redesign).
 *
 * This is the default landing for non-master DRIs. It replaces the legacy
 * embedded dashboard for this route. Layout follows the handoff:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ Header: scope · last refresh · data status              │
 *   │ Impersonation banner (if active)                        │
 *   │ KPI strip (4-6 cards)                                   │
 *   │ Filter chips (campus / level / subject / flag / state)  │
 *   │ Triage queue (top 10, expandable)                       │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Server-rendered. Filter state lives in the URL query string. Card buttons
 * are a small client island that POSTs to `/api/dashboard/feedback`.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { scopeForEmail } from "@/lib/dri-scopes";
import {
  fetchSourceData,
  filterDataForScope,
  isPending,
} from "@/lib/dashboard/scopedData";
import {
  applyOverlayToTriage,
  loadFeedbackOverlay,
} from "@/lib/dashboard/feedbackOverlay";
import {
  applyTriageFilters,
  computeTriageQueue,
  distinctFlagTypes,
  distinctSubjects,
  kpiCounts,
  type TriageFilters,
  type TriageItem,
} from "@/lib/dashboard/triage";
import { KpiStrip } from "@/components/dashboard/KpiStrip";
import {
  FilterChips,
  type FilterOption,
} from "@/components/dashboard/FilterChips";
import { TriageCard } from "@/components/dashboard/TriageCard";

export const dynamic = "force-dynamic";

const DEFAULT_VISIBLE = 10;

interface DashboardTriagePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value)) return value[0] || undefined;
  return undefined;
}

function parseFilters(
  searchParams: Record<string, string | string[] | undefined>
): TriageFilters {
  const stateRaw = firstString(searchParams.state);
  const state =
    stateRaw === "open" ||
    stateRaw === "acknowledged" ||
    stateRaw === "in_progress"
      ? stateRaw
      : undefined;
  return {
    campus: firstString(searchParams.campus),
    level: firstString(searchParams.level),
    subject: firstString(searchParams.subject),
    flagType: firstString(searchParams.flagType),
    owner: firstString(searchParams.owner),
    state,
  };
}

function generatedAtFromData(data: unknown): string | undefined {
  if (data && typeof data === "object") {
    const v = (data as { generated_at?: unknown }).generated_at;
    if (typeof v === "string") return v;
  }
  return undefined;
}

function formatRefresh(generatedAt?: string): string {
  if (!generatedAt) return "Unknown";
  const d = new Date(generatedAt);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default async function DashboardTriagePage({
  searchParams,
}: DashboardTriagePageProps) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const scope = scopeForEmail(email);
  if (!scope) redirect("/login");

  const params = (await searchParams) ?? {};
  const filters = parseFilters(params);
  const showResolved =
    firstString(params.showResolved) === "1" ||
    firstString(params.showResolved) === "true";

  const sourceRaw = await fetchSourceData();
  if (isPending(sourceRaw)) {
    return (
      <PendingShell
        scope={scope}
        message={sourceRaw.message}
        userEmail={email}
      />
    );
  }
  const filtered = filterDataForScope(sourceRaw, scope);
  const overlay = await loadFeedbackOverlay(scope);

  const generatedAt = generatedAtFromData(filtered);
  const counts = kpiCounts(filtered, scope, overlay, generatedAt);

  // computeTriageQueue already drops resolved/incorrect/snoozed cards. When
  // ?showResolved=1 is on, include them by re-running the overlay against the
  // raw queue and keeping resolved entries.
  const queueAll = computeTriageQueue(filtered, scope, overlay);

  // applyOverlayToTriage gives us the canonical "hide resolved unless asked"
  // sort + filter. We feed in the (already-derived) lifecycle as the urgency
  // tiebreaker. Cards that PR2 already pre-filtered out (resolved) are
  // re-introduced here when showResolved is true.
  type Row = {
    studentId: string;
    flagId?: string;
    urgencyRank: number;
    flaggedAt?: string;
    src: TriageItem;
  };
  const urgencyRank = (u: TriageItem["urgency"]): number =>
    u === "critical" ? 0 : u === "attention" ? 1 : 2;

  const inputRows: Row[] = queueAll.map((item) => ({
    studentId: item.studentId,
    flagId: undefined,
    urgencyRank: urgencyRank(item.urgency),
    flaggedAt: item.lifecycleAt,
    src: item,
  }));

  const overlayApplied = applyOverlayToTriage<Row>(inputRows, overlay, {
    showResolved,
  });

  const queueAfterOverlay: TriageItem[] = overlayApplied.map((row) => ({
    ...row.item.src,
    lifecycleState: row.state,
    lifecycleAt: row.latestAt ?? row.item.src.lifecycleAt,
    lifecycleBy: row.latestBy ?? row.item.src.lifecycleBy,
  }));

  const queueFiltered = applyTriageFilters(queueAfterOverlay, filters);

  // Filter option lists — derived from the unfiltered queue so that selecting
  // one filter doesn't immediately empty out the others.
  const campusOptions: FilterOption[] = uniqueLabels(
    queueAll.map((q) => q.campus).filter(Boolean)
  );
  const levelOptions: FilterOption[] = uniqueLabels(
    queueAll.map((q) => q.level).filter(Boolean)
  );
  const subjectOptions: FilterOption[] = distinctSubjects(queueAll).map(
    (s) => ({ value: s, label: s })
  );
  const flagOptions: FilterOption[] = distinctFlagTypes(queueAll).map((s) => ({
    value: s,
    label: s,
  }));
  const stateOptions: FilterOption[] = [
    { value: "open", label: "Open" },
    { value: "acknowledged", label: "Acknowledged" },
    { value: "in_progress", label: "In progress" },
  ];

  const showAll = firstString(params.show) === "all";
  const visible = showAll ? queueFiltered : queueFiltered.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = queueFiltered.length - visible.length;

  return (
    <main className="min-h-screen bg-paper">
      <Header
        scope={scope}
        userEmail={email}
        refreshLabel={formatRefresh(generatedAt)}
        freshness={counts.dataFreshness}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <ImpersonationBanner active={false} />

        <h1 className="sr-only">Triage</h1>

        <KpiStrip counts={counts} />

        <FilterChips
          basePath="/dashboard/triage"
          searchParams={params}
          filters={filters}
          campuses={campusOptions}
          levels={levelOptions}
          subjects={subjectOptions}
          flagTypes={flagOptions}
          states={stateOptions}
        />

        <ShowResolvedToggle
          basePath="/dashboard/triage"
          params={params}
          showResolved={showResolved}
          resolvedCount={overlay.resolvedThisWeek}
          available={overlay.available}
        />

        <section aria-label="Triage queue" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm uppercase tracking-wider text-stone-500 font-medium">
              Triage queue
            </h2>
            <p className="text-xs text-stone-500">
              {queueFiltered.length === 0
                ? "0 students"
                : `Showing ${visible.length} of ${queueFiltered.length}`}
            </p>
          </div>

          {visible.length === 0 ? (
            <EmptyState filters={filters} />
          ) : (
            visible.map((item) => (
              <TriageCard key={item.studentId} item={item} />
            ))
          )}

          {hiddenCount > 0 ? (
            <ShowMoreLink
              count={hiddenCount}
              params={params}
              basePath="/dashboard/triage"
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function uniqueLabels(values: string[]): FilterOption[] {
  const set = new Set<string>();
  for (const v of values) set.add(v);
  return Array.from(set)
    .sort()
    .map((v) => ({ value: v, label: v }));
}

interface HeaderProps {
  scope: ReturnType<typeof scopeForEmail>;
  userEmail: string;
  refreshLabel: string;
  freshness: "fresh" | "partial" | "stale" | "unknown";
}

function freshnessDot(
  freshness: HeaderProps["freshness"]
): { color: string; label: string } {
  if (freshness === "fresh") return { color: "bg-emerald-500", label: "Fresh" };
  if (freshness === "partial")
    return { color: "bg-amber-500", label: "Partial" };
  if (freshness === "stale") return { color: "bg-red-500", label: "Stale" };
  return { color: "bg-stone-300", label: "Unknown" };
}

function Header({ scope, userEmail, refreshLabel, freshness }: HeaderProps) {
  const dot = freshnessDot(freshness);
  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-xl flex-shrink-0" aria-label="Home">
            🧠
          </Link>
          <div className="min-w-0">
            <h1 className="font-semibold text-ink text-sm truncate">
              Alpha Brain Dashboard
            </h1>
            <p className="text-xs text-stone-500 truncate">
              {scope?.role ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-xs text-stone-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${dot.color}`}
              aria-hidden
            />
            <span>
              {dot.label}
              <span className="text-stone-400"> · refreshed {refreshLabel}</span>
            </span>
          </span>
          <span className="hidden md:inline">{userEmail}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-stone-500 hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

function ImpersonationBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Impersonating another DRI. Your actions are logged.
    </div>
  );
}

function EmptyState({ filters }: { filters: TriageFilters }) {
  const hasFilters = Object.values(filters).some(Boolean);
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-6 text-center">
      <p className="text-sm font-medium text-ink mb-1">No critical flags</p>
      <p className="text-xs text-stone-500 leading-relaxed">
        {hasFilters
          ? "No students match the current filters. Try clearing one or more filters above."
          : "All students in your scope are clear of critical issues as of the latest refresh."}
      </p>
    </div>
  );
}

interface ShowResolvedToggleProps {
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  showResolved: boolean;
  resolvedCount: number;
  available: boolean;
}

function ShowResolvedToggle({
  basePath,
  params,
  showResolved,
  resolvedCount,
  available,
}: ShowResolvedToggleProps) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v) next[k] = v;
  }
  if (showResolved) {
    delete next.showResolved;
  } else {
    next.showResolved = "1";
  }
  const qs = new URLSearchParams(next).toString();
  const href = qs ? `${basePath}?${qs}` : basePath;

  const label = !available
    ? "Feedback overlay offline"
    : showResolved
    ? `Hide resolved (${resolvedCount})`
    : `Show resolved (${resolvedCount})`;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-stone-500">
        Resolved/Incorrect/Snoozed cards are hidden by default.
      </p>
      <Link
        href={href}
        className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs border transition ${
          showResolved
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:text-ink"
        }`}
      >
        {label}
      </Link>
    </div>
  );
}

function ShowMoreLink({
  count,
  params,
  basePath,
}: {
  count: number;
  params: Record<string, string | string[] | undefined>;
  basePath: string;
}) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v) next[k] = v;
  }
  next.show = "all";
  const qs = new URLSearchParams(next).toString();
  return (
    <div className="pt-1">
      <Link
        href={qs ? `${basePath}?${qs}` : basePath}
        className="inline-flex items-center px-3 py-1.5 rounded-md text-xs border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:text-ink transition"
      >
        Show {count} more
      </Link>
    </div>
  );
}

interface PendingShellProps {
  scope: NonNullable<ReturnType<typeof scopeForEmail>>;
  message: string;
  userEmail: string;
}

function PendingShell({ scope, message, userEmail }: PendingShellProps) {
  return (
    <main className="min-h-screen bg-paper">
      <Header
        scope={scope}
        userEmail={userEmail}
        refreshLabel="—"
        freshness="unknown"
      />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-base font-semibold text-ink">
            Dashboard data not yet available
          </h2>
          <p className="text-sm text-stone-600 mt-2 leading-relaxed">
            {message}
          </p>
        </div>
      </div>
    </main>
  );
}
