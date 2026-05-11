/**
 * UnifiedDashboard — single comprehensive landing surface for ALL DRI-style
 * roles (operator, admin, campus_dri, master).
 *
 * Same structure for Tripti and the campus DRIs — what differs is the scope
 * the data has been narrowed to:
 *
 *   - Tripti (master/operator): all 4 campuses, all 5 levels, ~206 students,
 *     4 campus rollup cards visible, 5 level rollup cards visible.
 *   - Claudio (BTX, WL/LL/L1): 1 campus, 3 levels, ~31 students, 0 campus
 *     rollup cards (single-campus → auto-hide), 3 level rollup cards.
 *   - Bruna (Miami, all levels): 1 campus, 5 levels, 0 campus rollup cards,
 *     5 level rollup cards.
 *
 * The data fetcher (`loadDashboardData`) already filters by scope, so this
 * component just renders what it gets. Sections that span dimensions the
 * caller's scope doesn't span auto-hide (we never show a 1-card "campus
 * rollup" or "level rollup" section).
 *
 * Layout (top to bottom):
 *   1. Header (scope badge, refresh, freshness)
 *   2. Subject filter chip strip — multi-select drill-down
 *   3. Pipeline status chip + Data Health link
 *   4. KPI strip
 *   5. Triage queue (top 10 + show-more)
 *   6. Campus rollup cards (only if 2+ campuses in scope)
 *   7. Level rollup cards (only if 2+ levels in scope)
 *   8. Subject rollup
 *   9. DRI workload (only if 2+ DRIs visible)
 *  10. Recent escalations
 *  11. Repeat students
 *  12. Footer (Data Health link)
 *
 * Server component. Filter state lives in the URL query string. Card action
 * buttons are an existing client island (`TriageActions`).
 */
import Link from "next/link";
import { signOut } from "@/lib/auth";
import type { DriScope } from "@/lib/dri-scopes";
import {
  campusRollups,
  driWorkload,
  dashboardKpis,
  levelRollups,
  recentEscalations,
  repeatStudents,
  subjectRollups,
  triageQueueAcrossCampuses,
  DASHBOARD_SUBJECTS,
  type DashboardFilters,
  type DashboardPayload,
} from "@/lib/dashboard/masterView";
import { KpiStrip } from "./KpiStrip";
import { MasterTriageQueue } from "./MasterTriageQueue";
import { CampusRollupCards } from "./CampusRollupCards";
import { SubjectRollup } from "./SubjectRollup";
import { RecentEscalations } from "./RecentEscalations";
import { RepeatStudents } from "./RepeatStudents";
import { LevelRollupCards } from "./LevelRollupCards";

interface UnifiedDashboardProps {
  scope: DriScope;
  payload: DashboardPayload;
  searchParams: Record<string, string | string[] | undefined>;
  userEmail: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function firstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value)) return value[0] || undefined;
  return undefined;
}

/** Parse `?subject=Math,Reading` (or `?subject=Math&subject=Reading`) safely. */
export function parseSubjectsFromQuery(
  raw: string | string[] | undefined,
  allowed: ReadonlyArray<string> = DASHBOARD_SUBJECTS
): string[] {
  const allowedLower = new Map(allowed.map((s) => [s.toLowerCase(), s]));
  const tokens = Array.isArray(raw)
    ? raw.flatMap((v) => v.split(","))
    : typeof raw === "string"
    ? raw.split(",")
    : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    const key = tok.trim().toLowerCase();
    if (!key) continue;
    const canonical = allowedLower.get(key);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

export function parseDashboardFilters(
  searchParams: Record<string, string | string[] | undefined>
): DashboardFilters {
  return {
    subjects: parseSubjectsFromQuery(searchParams.subject, DASHBOARD_SUBJECTS),
  };
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

/** Short scope label for the header — e.g. "Master · all campuses · 206 students". */
function scopeBadgeLabel(
  scope: DriScope,
  studentsInScope: number
): string {
  const isMaster = scope.campuses.length === 0 && scope.levels.length === 0;
  if (isMaster) {
    return `Master · all campuses · ${studentsInScope} students`;
  }
  const parts: string[] = [scope.name];
  if (scope.campuses.length > 0) parts.push(scope.campuses.join("/"));
  if (scope.levels.length > 0) parts.push(scope.levels.join("/"));
  parts.push(`${studentsInScope} students`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function UnifiedDashboard({
  scope,
  payload,
  searchParams,
  userEmail,
}: UnifiedDashboardProps) {
  const filters = parseDashboardFilters(searchParams);
  const counts = dashboardKpis(payload, filters);
  const queue = triageQueueAcrossCampuses(payload, filters);
  const rollupsCampus = campusRollups(payload, filters);
  const rollupsLevel = levelRollups(payload, filters);
  const subjects = subjectRollups(payload);
  const workload = driWorkload(payload, filters);
  const escalations = recentEscalations(payload.overlay, {
    days: 7,
    subjects: filters.subjects,
  });
  const repeats = repeatStudents(payload, filters);

  const showAll = firstString(searchParams.show) === "all";
  const showCampusRollup = rollupsCampus.length >= 2;
  const showLevelRollup = rollupsLevel.length >= 2;
  const showWorkload = workload.length >= 2;

  return (
    <main className="min-h-screen bg-paper">
      <Header
        scope={scope}
        userEmail={userEmail}
        refreshLabel={formatRefresh(payload.generatedAt)}
        freshness={counts.dataFreshness}
        scopeLabel={scopeBadgeLabel(scope, counts.studentsInScope)}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <h1 className="sr-only">Brain Dashboard — {scope.name}</h1>

        <SubjectFilterStrip
          basePath="/dashboard"
          searchParams={searchParams}
          activeSubjects={filters.subjects}
        />

        <PipelineStatusChip generatedAt={payload.generatedAt} />

        <KpiStrip counts={counts} />

        <MasterTriageQueue
          items={queue}
          showAll={showAll}
          basePath="/dashboard"
          searchParams={searchParams}
        />

        {showCampusRollup ? <CampusRollupCards rollups={rollupsCampus} /> : null}

        {showLevelRollup ? <LevelRollupCards rollups={rollupsLevel} /> : null}

        <SubjectRollup
          rollups={subjects}
          active={filters.subjects}
          basePath="/dashboard"
          searchParams={searchParams}
        />

        {showWorkload ? <DriWorkloadStrip workload={workload} /> : null}

        <RecentEscalations
          events={escalations}
          overlayAvailable={payload.overlay.available}
        />

        <RepeatStudents students={repeats} />

        <Footer />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Page-local UI (kept private to this component)                     */
/* ------------------------------------------------------------------ */

interface HeaderProps {
  scope: DriScope;
  userEmail: string;
  refreshLabel: string;
  freshness: "fresh" | "partial" | "stale" | "unknown";
  scopeLabel: string;
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

function Header({
  userEmail,
  refreshLabel,
  freshness,
  scopeLabel,
}: HeaderProps) {
  const dot = freshnessDot(freshness);
  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="text-xl flex-shrink-0"
            aria-label="Home"
          >
            🧠
          </Link>
          <div className="min-w-0">
            <h1 className="font-semibold text-ink text-sm truncate">
              Alpha Brain Dashboard
            </h1>
            <p className="text-xs text-stone-500 truncate">{scopeLabel}</p>
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
              <span className="text-stone-400">
                {" "}· refreshed {refreshLabel}
              </span>
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

interface SubjectFilterStripProps {
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  activeSubjects: string[];
}

function SubjectFilterStrip({
  basePath,
  searchParams,
  activeSubjects,
}: SubjectFilterStripProps) {
  const lower = new Set(activeSubjects.map((s) => s.toLowerCase()));
  const buildToggle = (subject: string | null): string => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string" && v && k !== "subject") next[k] = v;
    }
    let resulting: string[];
    if (subject === null) {
      resulting = [];
    } else {
      const isActive = lower.has(subject.toLowerCase());
      resulting = isActive
        ? activeSubjects.filter(
            (s) => s.toLowerCase() !== subject.toLowerCase()
          )
        : [...activeSubjects, subject];
    }
    if (resulting.length > 0) next.subject = resulting.join(",");
    const qs = new URLSearchParams(next).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const baseChip =
    "inline-flex items-center px-2.5 py-1 rounded-full text-xs border transition";
  const allActive = activeSubjects.length === 0;

  return (
    <section
      aria-label="Subject filter"
      className="rounded-lg border border-stone-200 bg-white p-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium min-w-[64px]">
          Subjects
        </span>
        <Link
          href={buildToggle(null)}
          className={
            allActive
              ? `${baseChip} bg-ink text-white border-ink`
              : `${baseChip} bg-white text-stone-700 border-stone-200 hover:border-stone-300`
          }
        >
          All subjects
        </Link>
        {DASHBOARD_SUBJECTS.map((subj) => {
          const isActive = lower.has(subj.toLowerCase());
          return (
            <Link
              key={subj}
              href={buildToggle(subj)}
              className={
                isActive
                  ? `${baseChip} bg-ink text-white border-ink`
                  : `${baseChip} bg-white text-stone-700 border-stone-200 hover:border-stone-300`
              }
              aria-pressed={isActive}
            >
              {subj}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function PipelineStatusChip({ generatedAt }: { generatedAt?: string }) {
  const refreshed = formatRefresh(generatedAt);
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-[11px] text-stone-600 flex items-center gap-3 flex-wrap">
      <span className="uppercase tracking-wider text-stone-500 font-medium">
        Pipeline
      </span>
      <span>AlphaTest · {refreshed}</span>
      <span className="text-stone-300">·</span>
      <span>Coaching · {refreshed}</span>
      <span className="text-stone-300">·</span>
      <span>MAP · weekly</span>
      <span className="text-stone-300">·</span>
      <span>AI · {refreshed}</span>
      <span className="ml-auto">
        <Link
          href="/dashboard/data-health"
          className="text-stone-700 hover:text-ink underline-offset-2 hover:underline"
        >
          Data Health →
        </Link>
      </span>
    </div>
  );
}

interface DriWorkloadStripProps {
  workload: ReturnType<typeof driWorkload>;
}

function DriWorkloadStrip({ workload }: DriWorkloadStripProps) {
  return (
    <section aria-label="DRI workload" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider text-stone-500 font-medium">
          DRI workload
        </h2>
        <p className="text-xs text-stone-500">
          Open count + oldest unacknowledged per DRI
        </p>
      </div>
      <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
        {workload.map((w) => (
          <li
            key={w.driEmail}
            className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium text-ink">{w.driName}</span>
              <span className="text-[11px] text-stone-500"> · {w.campus}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-700">
              <span className="tabular-nums">
                <span className="font-semibold text-ink">{w.open}</span> open
              </span>
              <span className="text-stone-400">·</span>
              <span className="tabular-nums">
                {w.oldestUnacknowledgedDays === null
                  ? "no aging"
                  : `${w.oldestUnacknowledgedDays}d oldest`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer() {
  return (
    <footer className="pt-2 border-t border-stone-200 mt-4 text-xs text-stone-500 flex items-center justify-between gap-3 flex-wrap">
      <Link
        href="/dashboard/data-health"
        className="hover:text-ink underline-offset-2 hover:underline"
      >
        Data Health →
      </Link>
    </footer>
  );
}
