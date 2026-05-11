/**
 * /dashboard/manager — Manager (read-only) overview.
 *
 * Calm, high-level oversight without classroom action queues. Defensively
 * read-only: this page does not import TriageActions, EscalationButton, or
 * any other client component that mutates feedback events. The "Read-only"
 * badge is rendered on every section so it's visually obvious.
 *
 * Role gating:
 *   - manager_readonly  → render
 *   - operator / admin  → render (managers' bosses can see this view too)
 *   - everyone else     → redirect to their natural landing
 *
 * Repeat students are derived from the feedback overlay history. Any student
 * with feedback events spanning 2+ ISO weeks counts.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  isReadOnly,
  landingForRole,
  roleForScope,
  scopeForEmail,
} from "@/lib/dri-scopes";
import {
  fetchSourceData,
  filterDataForScope,
  isPending,
} from "@/lib/dashboard/scopedData";
import {
  loadFeedbackOverlay,
  type FeedbackOverlay,
} from "@/lib/dashboard/feedbackOverlay";
import { computeTriageQueue, type TriageItem } from "@/lib/dashboard/triage";
import {
  ManagerOverview,
  type ManagerCampusRow,
  type ManagerDataHealth,
  type ManagerOldestRow,
  type ManagerOwnerRow,
  type ManagerRepeatRow,
} from "@/components/dashboard/ManagerOverview";

export const dynamic = "force-dynamic";

function isoWeek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function ageDays(iso?: string, refMs: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((refMs - t) / (1000 * 60 * 60 * 24)));
}

function buildOldestRows(triage: TriageItem[]): ManagerOldestRow[] {
  const rows: ManagerOldestRow[] = [];
  const now = Date.now();
  for (const t of triage) {
    if (t.lifecycleState === "open" || t.lifecycleState === "acknowledged") {
      const age = ageDays(t.lifecycleAt, now);
      rows.push({
        studentName: t.studentName,
        campus: t.campus,
        ageDays: age ?? 99,
        state: t.lifecycleState,
      });
    }
  }
  rows.sort((a, b) => b.ageDays - a.ageDays);
  return rows;
}

function buildCampusRows(triage: TriageItem[]): ManagerCampusRow[] {
  const map = new Map<string, ManagerCampusRow>();
  for (const t of triage) {
    const campus = t.campus || "Unknown";
    const row = map.get(campus) ?? {
      campus,
      critical: 0,
      attention: 0,
      studentsInScope: 0,
    };
    row.studentsInScope += 1;
    if (t.urgency === "critical") row.critical += 1;
    else if (t.urgency === "attention") row.attention += 1;
    map.set(campus, row);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.critical - a.critical || b.studentsInScope - a.studentsInScope
  );
}

function buildOwnerRows(
  triage: TriageItem[],
  overlay: FeedbackOverlay
): ManagerOwnerRow[] {
  const map = new Map<string, ManagerOwnerRow>();
  for (const t of triage) {
    const row = map.get(t.ownerLabel) ?? {
      ownerLabel: t.ownerLabel,
      open: 0,
      inProgress: 0,
      resolvedThisWeek: 0,
    };
    if (t.lifecycleState === "open") row.open += 1;
    else if (t.lifecycleState === "in_progress") row.inProgress += 1;
    map.set(t.ownerLabel, row);
  }
  // Resolved-this-week per-owner is approximated from the overlay snapshot.
  if (overlay.available) {
    overlay.byKey.forEach((entry) => {
      if (entry.state !== "resolved") return;
      const snapshot = entry.events[entry.events.length - 1]?.userScopeSnapshot;
      const ownerLabel = snapshot?.dri ? `Owner: ${snapshot.dri}` : "Owner: ?";
      const row = map.get(ownerLabel) ?? {
        ownerLabel,
        open: 0,
        inProgress: 0,
        resolvedThisWeek: 0,
      };
      row.resolvedThisWeek += 1;
      map.set(ownerLabel, row);
    });
  }
  return Array.from(map.values()).sort(
    (a, b) => b.open + b.inProgress - (a.open + a.inProgress)
  );
}

function buildRepeatRows(
  overlay: FeedbackOverlay,
  triageByStudent: Map<string, TriageItem>
): ManagerRepeatRow[] {
  if (!overlay.available) return [];
  const weeksByStudent = new Map<string, Set<string>>();
  overlay.byKey.forEach((entry) => {
    for (const evt of entry.events) {
      const sid = evt.studentId;
      const wk = isoWeek(evt.createdAt);
      const set = weeksByStudent.get(sid) ?? new Set<string>();
      set.add(wk);
      weeksByStudent.set(sid, set);
    }
  });
  const rows: ManagerRepeatRow[] = [];
  weeksByStudent.forEach((weeks, studentId) => {
    if (weeks.size < 2) return;
    const triage = triageByStudent.get(studentId);
    rows.push({
      studentName: triage?.studentName || studentId,
      campus: triage?.campus,
      weekCount: weeks.size,
      reason: triage?.whyNow,
    });
  });
  return rows.sort((a, b) => b.weekCount - a.weekCount);
}

function buildDataHealth(data: unknown): ManagerDataHealth[] {
  // Best-effort: try a few common shapes. When nothing matches, return a
  // single "Unknown" row so the UI never renders an empty section.
  const sources: ManagerDataHealth[] = [];
  if (data && typeof data === "object") {
    const dh =
      (data as { data_health?: Record<string, unknown> }).data_health ??
      (data as { data_freshness?: Record<string, unknown> }).data_freshness;
    if (dh && typeof dh === "object") {
      for (const [source, entry] of Object.entries(dh)) {
        if (entry && typeof entry === "object") {
          const status =
            (entry as { status?: string }).status?.toLowerCase() ?? "unknown";
          const safe: ManagerDataHealth["status"] =
            status === "fresh" ||
            status === "partial" ||
            status === "stale" ||
            status === "failed"
              ? status
              : "unknown";
          sources.push({
            source,
            status: safe,
            notes: (entry as { notes?: string }).notes,
          });
        }
      }
    }
  }
  if (sources.length === 0) {
    sources.push({
      source: "Pipeline status",
      status: "unknown",
      notes: "Data Health summary not yet emitted by the build pipeline.",
    });
  }
  return sources;
}

export default async function ManagerDashboardPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const scope = scopeForEmail(email);
  if (!scope) redirect("/login");

  const role = roleForScope(scope);

  // Defensive role gating. Manager view is for manager_readonly +
  // operator/admin (their bosses). Anyone else is redirected.
  if (
    role !== "manager_readonly" &&
    role !== "operator" &&
    role !== "admin"
  ) {
    redirect(landingForRole(role));
  }

  const raw = await fetchSourceData();
  if (isPending(raw)) {
    return (
      <main className="min-h-screen bg-paper p-6">
        <div className="max-w-2xl mx-auto rounded-lg border border-stone-200 bg-white p-6">
          <h1 className="text-lg font-semibold">Manager view</h1>
          <p className="text-sm text-stone-700 mt-2">{raw.message}</p>
        </div>
      </main>
    );
  }

  const filtered = filterDataForScope(raw, scope);
  const overlay = await loadFeedbackOverlay(scope);
  const triage = computeTriageQueue(filtered, scope, overlay);
  const triageByStudent = new Map<string, TriageItem>();
  for (const t of triage) triageByStudent.set(t.studentId, t);

  const campusRows = buildCampusRows(triage);
  const ownerRows = buildOwnerRows(triage, overlay);
  const oldestRows = buildOldestRows(triage);
  const repeatRows = buildRepeatRows(overlay, triageByStudent);
  const dataHealth = buildDataHealth(filtered);

  const readOnly = isReadOnly(scope);

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-ink">
              Manager overview
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">{scope.role}</p>
          </div>
          {readOnly ? (
            <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border bg-stone-50 text-stone-700 border-stone-200">
              Read-only
            </span>
          ) : (
            <span className="text-[11px] text-stone-500">
              You have edit rights elsewhere — buttons are still hidden in this
              view to keep it audit-clean.
            </span>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <ManagerOverview
          resolvedThisWeek={overlay.resolvedThisWeek}
          campusRows={campusRows}
          ownerRows={ownerRows}
          oldestRows={oldestRows}
          repeatRows={repeatRows}
          dataHealth={dataHealth}
        />
      </div>
    </main>
  );
}
