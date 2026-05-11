/**
 * Unified dashboard derivations — server-side helpers for the comprehensive
 * landing page at `/dashboard`. Both Tripti (master/operator) AND Campus DRIs
 * (Claudio, Ana, Bruna, Soaham, Piri) see the SAME structure — just filtered
 * to their scope.
 *
 * Design principle (from the handoff "Operator/Admin View" + "Campus DRI
 * View"): one page, everything in one place. Subject filter is a drill-down
 * on the same page, never a separate route. Rollups that span dimensions the
 * caller's scope doesn't span (e.g. campus rollup for a single-campus DRI)
 * auto-hide.
 *
 * No I/O here other than the orchestration helper `loadDashboardData()` which
 * delegates to the existing `fetchSourceData` + `loadFeedbackOverlay`. All
 * derivations are pure so they are easy to unit-test.
 *
 * NOTE: this module was originally scoped to Tripti's master view ("masterView")
 * and is now reused for every DRI-style role. The legacy `loadMasterData` /
 * `MasterFilters` / `MasterKpis` / `MASTER_SUBJECTS` exports remain as aliases.
 */
import type { DriScope } from "@/lib/dri-scopes";
import {
  DRI_SCOPES,
  isCampusInScope,
  isLevelInScope,
  scopeForEmail,
} from "@/lib/dri-scopes";
import {
  fetchSourceData,
  filterDataForScope,
  isPending,
  type DashboardData,
  type PendingEnvelope,
} from "@/lib/dashboard/scopedData";
import {
  loadFeedbackOverlay,
  type FeedbackEvent,
  type FeedbackOverlay,
  type LifecycleState,
} from "@/lib/dashboard/feedbackOverlay";
import {
  computeTriageQueue,
  evidenceChips,
  suggestedAction,
  urgencyOf,
  whyNow,
  type TriageItem,
  type Urgency,
} from "@/lib/dashboard/triage";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

/** Subjects we render rollups for, in the order they appear on the page. */
export const DASHBOARD_SUBJECTS: ReadonlyArray<string> = [
  "Math",
  "Reading",
  "Language",
  "Writing",
  "Science",
  "Social Studies",
  "Vocabulary",
  "FastMath",
];

/** @deprecated use `DASHBOARD_SUBJECTS`. Kept for back-compat. */
export const MASTER_SUBJECTS = DASHBOARD_SUBJECTS;

export interface DashboardFilters {
  /** Subjects to keep (case-insensitive). Empty = no filter. */
  subjects: string[];
}

/** @deprecated use `DashboardFilters`. Kept for back-compat. */
export type MasterFilters = DashboardFilters;

export interface CampusRollup {
  campusId: string;
  campusLabel: string;
  studentsInScope: number;
  critical: number;
  attention: number;
  oldestUnacknowledgedDays: number | null;
  topIssue: string;
  driName: string;
  driEmail: string;
}

export interface LevelRollup {
  levelId: string;
  levelLabel: string;
  studentsInScope: number;
  critical: number;
  attention: number;
  topIssue: string;
}

export interface SubjectRollup {
  subject: string;
  studentsFlagged: number;
  critical: number;
  attention: number;
  topConcept: string;
  campusesAffected: string[];
}

export interface RecentEscalation {
  eventId: string;
  createdAt: string;
  studentId: string;
  subject?: string;
  campus?: string;
  state: LifecycleState;
  ownerLabel: string;
  notePreview: string;
}

export interface RepeatStudent {
  studentId: string;
  studentName: string;
  campus: string;
  level: string;
  consecutiveWeeks: number;
  reason: string;
}

export interface DashboardPayload {
  /**
   * Scope-filtered dashboard payload. For master scopes this is the raw
   * data; for campus DRIs it has been narrowed via `filterDataForScope`.
   */
  data: DashboardData;
  /** Caller's DRI scope. */
  scope: DriScope;
  overlay: FeedbackOverlay;
  generatedAt?: string;
}

/** @deprecated alias for DashboardPayload. */
export type MasterData = DashboardPayload;

export type LoadDashboardResult =
  | { kind: "ok"; payload: DashboardPayload }
  | { kind: "pending"; message: string }
  | { kind: "no_access" };

/** @deprecated alias for LoadDashboardResult. */
export type LoadMasterResult = LoadDashboardResult;

/* ------------------------------------------------------------------ */
/* Internal record shapes (loose — source JSON is dynamic)            */
/* ------------------------------------------------------------------ */

interface StudentRecord {
  id?: string;
  slug?: string;
  student_id?: string;
  name?: string;
  campus?: string;
  campus_id?: string;
  level?: string;
  attention_reason?: string;
  flagged_subjects?: Array<{
    subject?: string;
    flags?: string[];
    default_status?: string;
  }>;
  doom_loops?: number;
  [k: string]: unknown;
}

interface StudentDD {
  id?: string;
  identity?: { campus?: string; level?: string; name?: string };
  test_history?: {
    tests?: Array<{
      slug?: string;
      label?: string;
      score?: number;
      passed?: boolean;
      timestamp?: string;
    }>;
    doom_loops?: Array<{ subject?: string; test?: string; count?: number }>;
  };
  engagement_diagnosis?: {
    overall?: { status?: string; reason?: string };
    by_subject?: Record<string, { status?: string; reason?: string }>;
  };
  alphatest_picks?: {
    by_test_slug?: Record<string, unknown>;
    /**
     * Some payload variants expose a flat list with alignment metadata.
     * We accept either shape — see `extractTopStandard`.
     */
    [k: string]: unknown;
  };
  flagged_subjects?: Array<{ subject?: string; flags?: string[] }>;
  [k: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSlug(s: StudentRecord): string {
  return (
    (typeof s.slug === "string" && s.slug) ||
    (typeof s.id === "string" && s.id) ||
    (typeof s.student_id === "string" && s.student_id) ||
    ""
  );
}

function getDD(data: DashboardData, slug: string): StudentDD | undefined {
  const dds = data.student_dds;
  if (!dds || typeof dds !== "object") return undefined;
  return dds[slug] as StudentDD | undefined;
}

function generatedAtFromData(data: DashboardData): string | undefined {
  const v = (data as { generated_at?: unknown }).generated_at;
  if (typeof v === "string") return v;
  return undefined;
}

/** True when the master filter set should keep this student. */
function studentMatchesSubjectFilter(
  student: StudentRecord,
  dd: StudentDD | undefined,
  subjects: string[]
): boolean {
  if (subjects.length === 0) return true;
  const want = new Set(subjects.map((s) => s.toLowerCase()));
  for (const fs of student.flagged_subjects || []) {
    if (fs.subject && want.has(fs.subject.toLowerCase())) return true;
  }
  for (const fs of dd?.flagged_subjects || []) {
    if (fs.subject && want.has(fs.subject.toLowerCase())) return true;
  }
  const bySubj = dd?.engagement_diagnosis?.by_subject || {};
  for (const subj of Object.keys(bySubj)) {
    if (want.has(subj.toLowerCase())) {
      const status = bySubj[subj]?.status || "";
      if (/concern|risk|stuck|skipping|attention|critical/i.test(status)) {
        return true;
      }
    }
  }
  for (const dl of dd?.test_history?.doom_loops || []) {
    if (dl.subject && want.has(dl.subject.toLowerCase())) return true;
  }
  return false;
}

function isMaster(scope: DriScope): boolean {
  return scope.campuses.length === 0 && scope.levels.length === 0;
}

/* ------------------------------------------------------------------ */
/* Loader                                                             */
/* ------------------------------------------------------------------ */

/**
 * Load everything the unified dashboard needs in a single pass — works for
 * ALL DRI-style scopes (master, operator, admin, campus_dri). The data is
 * filtered to the caller's scope by `filterDataForScope` and the feedback
 * overlay is similarly scoped.
 *
 * Returns `{ kind: "no_access" }` when the email has no scope entry.
 */
export async function loadDashboardData(
  email: string | null | undefined
): Promise<LoadDashboardResult> {
  const scope = scopeForEmail(email);
  if (!scope) return { kind: "no_access" };

  const sourceRaw: DashboardData | PendingEnvelope = await fetchSourceData();
  if (isPending(sourceRaw)) {
    return { kind: "pending", message: sourceRaw.message };
  }

  // For master scope, filterDataForScope is a pass-through. For campus DRIs
  // it narrows campuses + students. The same call site works for both.
  const data = filterDataForScope(sourceRaw, scope);
  const overlay = await loadFeedbackOverlay(scope);
  const generatedAt = generatedAtFromData(data);

  return {
    kind: "ok",
    payload: { data, scope, overlay, generatedAt },
  };
}

/**
 * @deprecated alias for `loadDashboardData`. Returns `no_access` for any
 * non-master scope to preserve the original semantics.
 */
export async function loadMasterData(
  email: string | null | undefined
): Promise<LoadDashboardResult> {
  const scope = scopeForEmail(email);
  if (!scope) return { kind: "no_access" };
  if (!isMaster(scope)) return { kind: "no_access" };
  return loadDashboardData(email);
}

/* ------------------------------------------------------------------ */
/* Triage queue across campuses                                       */
/* ------------------------------------------------------------------ */

/**
 * Flatten all in-scope campuses into a single ranked queue, applying the
 * subject filter. For master scopes that's all 4 campuses; for a campus
 * DRI it's just their campus. Lifecycle overlay is already baked in by
 * `computeTriageQueue`.
 */
export function triageQueueAcrossCampuses(
  payload: DashboardPayload,
  filters: DashboardFilters
): TriageItem[] {
  const { data, scope, overlay } = payload;
  const queue = computeTriageQueue(data, scope, overlay);
  if (filters.subjects.length === 0) return queue;

  const want = new Set(filters.subjects.map((s) => s.toLowerCase()));
  const students = (data.students || []) as StudentRecord[];
  const studentBySlug = new Map<string, StudentRecord>();
  for (const s of students) studentBySlug.set(getSlug(s), s);

  return queue.filter((item) => {
    const s = studentBySlug.get(item.studentSlug);
    if (!s) return false;
    const dd = getDD(data, item.studentSlug);
    return studentMatchesSubjectFilter(s, dd, Array.from(want));
  });
}

/* ------------------------------------------------------------------ */
/* Per-campus rollups                                                 */
/* ------------------------------------------------------------------ */

/** DRIs for the four physical campuses Tripti monitors. */
const CAMPUS_DEFINITIONS: Array<{ id: string; label: string; driEmail: string }> = [
  { id: "BTX", label: "BTX", driEmail: "claudio.ibe@alpha.school" },
  { id: "GT", label: "GT", driEmail: "piriyanga.janakarajan@2hourlearning.com" },
  { id: "Miami", label: "Miami", driEmail: "bruna.rodrigues@2hourlearning.com" },
  {
    id: "Nova Bastrop",
    label: "Nova",
    driEmail: "soaham.sharma@alpha.school",
  },
];

function normalizeCampusKey(value: string): string {
  return (value || "").toLowerCase().replace(/\s+/g, "-");
}

function campusMatchesId(campusValue: string, campusId: string): boolean {
  return normalizeCampusKey(campusValue) === normalizeCampusKey(campusId);
}

function topIssueForCampus(
  data: DashboardData,
  students: StudentRecord[]
): string {
  const counts = new Map<string, number>();
  for (const s of students) {
    const slug = getSlug(s);
    const dd = getDD(data, slug);
    for (const fs of s.flagged_subjects || []) {
      const flag = (fs.flags || [])[0];
      if (flag) {
        counts.set(flag, (counts.get(flag) || 0) + 1);
      }
    }
    for (const dl of dd?.test_history?.doom_loops || []) {
      counts.set("Doom loop", (counts.get("Doom loop") || 0) + 1);
    }
  }
  let topKey = "";
  let topVal = 0;
  counts.forEach((v, k) => {
    if (v > topVal) {
      topKey = k;
      topVal = v;
    }
  });
  if (!topKey) return "—";
  // Convert internal labels into UI labels via the same map used elsewhere.
  return topKey
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Per-campus rollup. Only returns campuses inside the caller's scope —
 * a single-campus DRI gets back 1 card; the master gets all 4. The page
 * layer is expected to hide the section when only 1 campus is in scope.
 */
export function campusRollups(
  payload: DashboardPayload,
  filters: DashboardFilters
): CampusRollup[] {
  const { data, scope, overlay, generatedAt } = payload;
  const allStudents = (data.students || []) as StudentRecord[];
  const now = Date.now();

  const definitions = CAMPUS_DEFINITIONS.filter((def) =>
    isCampusInScope(scope, def.id)
  );

  return definitions.map((def) => {
    const driScope = DRI_SCOPES[def.driEmail];
    const driName = driScope?.name ?? "Unassigned";
    const studentsForCampus = allStudents.filter((s) => {
      const campusValue =
        (typeof s.campus_id === "string" && s.campus_id) ||
        (typeof s.campus === "string" && s.campus) ||
        "";
      if (!campusMatchesId(campusValue, def.id)) return false;
      if (filters.subjects.length === 0) return true;
      const dd = getDD(data, getSlug(s));
      return studentMatchesSubjectFilter(s, dd, filters.subjects);
    });

    let critical = 0;
    let attention = 0;
    let oldestDays: number | null = null;

    for (const s of studentsForCampus) {
      const slug = getSlug(s);
      const dd = getDD(data, slug);
      const u: Urgency = urgencyOf(s, dd);
      if (u === "critical") critical++;
      else if (u === "attention") attention++;

      if (u !== "on_track") {
        const entry = overlay.byKey.get(`${slug}::_student`);
        if (!entry && generatedAt) {
          const t = new Date(generatedAt).getTime();
          if (!Number.isNaN(t)) {
            const age = (now - t) / (1000 * 60 * 60 * 24);
            if (age >= 0 && (oldestDays === null || age > oldestDays)) {
              oldestDays = Math.floor(age);
            }
          }
        }
      }
    }

    return {
      campusId: def.id,
      campusLabel: def.label,
      studentsInScope: studentsForCampus.length,
      critical,
      attention,
      oldestUnacknowledgedDays: oldestDays,
      topIssue: topIssueForCampus(data, studentsForCampus),
      driName,
      driEmail: def.driEmail,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Per-level rollups                                                  */
/* ------------------------------------------------------------------ */

const LEVEL_DEFINITIONS: Array<{ id: string; label: string }> = [
  { id: "WL", label: "WL" },
  { id: "LL", label: "LL" },
  { id: "L1", label: "L1" },
  { id: "L2", label: "L2" },
  { id: "MS", label: "MS" },
];

/**
 * Per-level rollup. Returns one card per level in scope. A scope with
 * `levels === []` returns all 5 (master); a scope like Claudio's WL/LL/L1
 * returns 3. The page layer is expected to hide the section when only
 * 0-1 levels actually have students in scope.
 */
export function levelRollups(
  payload: DashboardPayload,
  filters: DashboardFilters
): LevelRollup[] {
  const { data, scope } = payload;
  const allStudents = (data.students || []) as StudentRecord[];

  const definitions = LEVEL_DEFINITIONS.filter((def) =>
    isLevelInScope(scope, def.id)
  );

  return definitions.map((def) => {
    const studentsForLevel = allStudents.filter((s) => {
      const lvl = (typeof s.level === "string" && s.level) || "";
      if (lvl.toUpperCase() !== def.id.toUpperCase()) return false;
      if (filters.subjects.length === 0) return true;
      const dd = getDD(data, getSlug(s));
      return studentMatchesSubjectFilter(s, dd, filters.subjects);
    });

    let critical = 0;
    let attention = 0;
    for (const s of studentsForLevel) {
      const slug = getSlug(s);
      const dd = getDD(data, slug);
      const u = urgencyOf(s, dd);
      if (u === "critical") critical++;
      else if (u === "attention") attention++;
    }

    return {
      levelId: def.id,
      levelLabel: def.label,
      studentsInScope: studentsForLevel.length,
      critical,
      attention,
      topIssue: topIssueForCampus(data, studentsForLevel),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Subject rollups                                                    */
/* ------------------------------------------------------------------ */

interface AlignmentLike {
  standards?: Array<{ code?: string; label?: string }>;
}

/** Pull the most-cited standard code/label from `dd.alphatest_picks` if any. */
function extractTopStandard(dd: StudentDD | undefined, subject: string): string | null {
  if (!dd) return null;
  const picks = dd.alphatest_picks;
  if (!picks || typeof picks !== "object") return null;

  const counts = new Map<string, number>();
  const visit = (alignment: unknown) => {
    if (!alignment || typeof alignment !== "object") return;
    const a = alignment as AlignmentLike;
    for (const std of a.standards || []) {
      const key = std.label || std.code;
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
  };

  // Common shape: alphatest_picks.by_test_slug[<slug>] = { alignment: {...} }
  const bySlug = (picks as { by_test_slug?: Record<string, unknown> }).by_test_slug;
  if (bySlug && typeof bySlug === "object") {
    for (const v of Object.values(bySlug)) {
      const subj =
        v && typeof v === "object" && "subject" in v
          ? String((v as { subject?: unknown }).subject || "")
          : "";
      if (subj && subj.toLowerCase() !== subject.toLowerCase()) continue;
      const alignment =
        v && typeof v === "object" && "alignment" in v
          ? (v as { alignment?: unknown }).alignment
          : undefined;
      visit(alignment);
    }
  }

  let topKey = "";
  let topVal = 0;
  counts.forEach((val, key) => {
    if (val > topVal) {
      topKey = key;
      topVal = val;
    }
  });
  return topKey || null;
}

/**
 * Per-subject rollup. Optional `subjectFilter` collapses the result to just
 * the listed subjects (still preserves order from MASTER_SUBJECTS).
 */
export function subjectRollups(
  payload: MasterData,
  subjectFilter?: string[]
): SubjectRollup[] {
  const { data } = payload;
  const want = subjectFilter && subjectFilter.length > 0
    ? new Set(subjectFilter.map((s) => s.toLowerCase()))
    : null;

  const students = (data.students || []) as StudentRecord[];

  return MASTER_SUBJECTS.filter(
    (subj) => !want || want.has(subj.toLowerCase())
  ).map((subj) => {
    let studentsFlagged = 0;
    let critical = 0;
    let attention = 0;
    const campuses = new Set<string>();
    const conceptCounts = new Map<string, number>();

    for (const s of students) {
      const slug = getSlug(s);
      const dd = getDD(data, slug);
      const subjectFlagged =
        (s.flagged_subjects || []).some(
          (fs) => fs.subject && fs.subject.toLowerCase() === subj.toLowerCase()
        ) ||
        (dd?.flagged_subjects || []).some(
          (fs) => fs.subject && fs.subject.toLowerCase() === subj.toLowerCase()
        ) ||
        (dd?.test_history?.doom_loops || []).some(
          (dl) => dl.subject && dl.subject.toLowerCase() === subj.toLowerCase()
        );

      if (!subjectFlagged) continue;
      studentsFlagged++;
      const u = urgencyOf(s, dd);
      if (u === "critical") critical++;
      else if (u === "attention") attention++;

      const campusValue =
        (typeof s.campus === "string" && s.campus) ||
        (typeof s.campus_id === "string" && s.campus_id) ||
        "";
      if (campusValue) campuses.add(campusValue);

      const top = extractTopStandard(dd, subj);
      if (top) conceptCounts.set(top, (conceptCounts.get(top) || 0) + 1);
    }

    let topConcept = "—";
    let bestVal = 0;
    conceptCounts.forEach((v, k) => {
      if (v > bestVal) {
        topConcept = k;
        bestVal = v;
      }
    });

    return {
      subject: subj,
      studentsFlagged,
      critical,
      attention,
      topConcept,
      campusesAffected: Array.from(campuses).sort(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Recent escalations                                                 */
/* ------------------------------------------------------------------ */

function notePreview(note?: string, max = 120): string {
  if (!note) return "";
  const trimmed = note.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

function ownerForCampus(campus: string | undefined): string {
  if (!campus) return "Unassigned";
  for (const def of CAMPUS_DEFINITIONS) {
    if (campusMatchesId(campus, def.id)) {
      const dri = DRI_SCOPES[def.driEmail];
      return dri?.name ?? "Unassigned";
    }
  }
  return "Unassigned";
}

/**
 * Last `days` days of escalation events. We treat any non-`open` action as
 * "escalation-worthy" so `acknowledge`, `in_progress`, `resolved`, `note`,
 * `incorrect` all surface here. The list is sorted newest first.
 *
 * Subject filter narrows by event.subject when provided.
 */
export function recentEscalations(
  overlay: FeedbackOverlay,
  options: { days?: number; subjects?: string[] } = {}
): RecentEscalation[] {
  const days = options.days ?? 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const subjectFilter =
    options.subjects && options.subjects.length > 0
      ? new Set(options.subjects.map((s) => s.toLowerCase()))
      : null;

  const out: RecentEscalation[] = [];
  overlay.byKey.forEach((entry) => {
    for (const evt of entry.events) {
      const t = new Date(evt.createdAt).getTime();
      if (Number.isNaN(t) || t < cutoff) continue;
      if (subjectFilter) {
        const subj = (evt.subject || "").toLowerCase();
        if (!subj || !subjectFilter.has(subj)) continue;
      }
      out.push({
        eventId: evt.eventId,
        createdAt: evt.createdAt,
        studentId: evt.studentId,
        subject: evt.subject,
        campus: evt.campus,
        state: actionToState(evt.action),
        ownerLabel: ownerForCampus(evt.campus),
        notePreview: notePreview(evt.note),
      });
    }
  });

  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function actionToState(action: FeedbackEvent["action"]): LifecycleState {
  switch (action) {
    case "acknowledge":
      return "acknowledged";
    case "in_progress":
    case "note":
      return "in_progress";
    case "resolved":
      return "resolved";
    case "incorrect":
      return "incorrect";
    case "snoozed":
      return "snoozed";
    default:
      return "open";
  }
}

/* ------------------------------------------------------------------ */
/* Repeat students                                                    */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoWeekKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Approximate ISO week — good enough for "are these in different 7-day buckets?"
  const days = Math.floor(d.getTime() / (7 * MS_PER_DAY));
  return String(days);
}

/**
 * Students who have appeared in the queue for 2+ consecutive ISO weeks.
 *
 * Two implementations layered together:
 *   1. Preferred: count distinct ISO-week buckets in the overlay event history
 *      per studentId. >=2 distinct weeks = repeat.
 *   2. Fallback: when overlay history is sparse (typical for fresh deploys),
 *      flag students whose `dd.test_history.tests` shows failed tests with
 *      timestamps spanning >=14 days, AND who have an `attention_reason`.
 */
export function repeatStudents(
  payload: MasterData,
  filters: MasterFilters
): RepeatStudent[] {
  const { data, overlay } = payload;
  const students = (data.students || []) as StudentRecord[];
  const out: RepeatStudent[] = [];

  // Pass 1 — overlay event history.
  const weeksByStudent = new Map<string, Set<string>>();
  overlay.byKey.forEach((entry) => {
    for (const evt of entry.events) {
      const wk = isoWeekKey(evt.createdAt);
      if (!wk) continue;
      const set = weeksByStudent.get(evt.studentId) ?? new Set<string>();
      set.add(wk);
      weeksByStudent.set(evt.studentId, set);
    }
  });

  const seen = new Set<string>();

  for (const s of students) {
    const slug = getSlug(s);
    if (!slug) continue;
    const dd = getDD(data, slug);
    if (filters.subjects.length > 0 && !studentMatchesSubjectFilter(s, dd, filters.subjects)) {
      continue;
    }

    const weeks = weeksByStudent.get(slug);
    if (weeks && weeks.size >= 2) {
      seen.add(slug);
      out.push({
        studentId: slug,
        studentName: s.name || dd?.identity?.name || slug,
        campus: s.campus || dd?.identity?.campus || "",
        level: s.level || dd?.identity?.level || "",
        consecutiveWeeks: weeks.size,
        reason:
          typeof s.attention_reason === "string" && s.attention_reason
            ? s.attention_reason
            : "Repeated lifecycle activity over multiple weeks.",
      });
      continue;
    }

    // Pass 2 — fallback when overlay is too sparse.
    if (typeof s.attention_reason === "string" && s.attention_reason.trim()) {
      const tests = (dd?.test_history?.tests || []).filter((t) => t.passed === false);
      if (tests.length >= 2) {
        const stamps = tests
          .map((t) => (t.timestamp ? new Date(t.timestamp).getTime() : NaN))
          .filter((n) => !Number.isNaN(n));
        if (stamps.length >= 2) {
          const span = Math.max(...stamps) - Math.min(...stamps);
          if (span >= 14 * MS_PER_DAY) {
            seen.add(slug);
            out.push({
              studentId: slug,
              studentName: s.name || dd?.identity?.name || slug,
              campus: s.campus || dd?.identity?.campus || "",
              level: s.level || dd?.identity?.level || "",
              consecutiveWeeks: 2,
              reason: s.attention_reason,
            });
          }
        }
      }
    }
  }

  return out
    .filter((r, i, arr) => arr.findIndex((x) => x.studentId === r.studentId) === i)
    .sort((a, b) => b.consecutiveWeeks - a.consecutiveWeeks)
    .slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* DRI workload                                                       */
/* ------------------------------------------------------------------ */

export interface DriWorkload {
  driName: string;
  driEmail: string;
  campus: string;
  open: number;
  oldestUnacknowledgedDays: number | null;
}

/**
 * Per-DRI open count + oldest unacknowledged. Computed from the campus
 * rollup so the numbers always reconcile with the campus cards.
 */
export function driWorkload(payload: MasterData, filters: MasterFilters): DriWorkload[] {
  const rollups = campusRollups(payload, filters);
  return rollups.map((r) => ({
    driName: r.driName,
    driEmail: r.driEmail,
    campus: r.campusLabel,
    open: r.critical + r.attention,
    oldestUnacknowledgedDays: r.oldestUnacknowledgedDays,
  }));
}

/* ------------------------------------------------------------------ */
/* Master KPIs                                                        */
/* ------------------------------------------------------------------ */

export interface DashboardKpis {
  critical: number;
  attention: number;
  /** On-track count — kept here so this type is compatible with KpiCounts. */
  onTrack: number;
  resolvedThisWeek: number;
  oldestUnacknowledgedDays: number | null;
  studentsInScope: number;
  dataFreshness: "fresh" | "partial" | "stale" | "unknown";
}

/** @deprecated alias for DashboardKpis. */
export type MasterKpis = DashboardKpis;

function computeFreshness(generatedAt?: string): DashboardKpis["dataFreshness"] {
  if (!generatedAt) return "unknown";
  const t = new Date(generatedAt).getTime();
  if (Number.isNaN(t)) return "unknown";
  const ageHrs = (Date.now() - t) / (1000 * 60 * 60);
  if (ageHrs < 24) return "fresh";
  if (ageHrs < 48) return "partial";
  return "stale";
}

/**
 * KPI strip values for the unified dashboard view. Filter-aware, so
 * `?subject=Math` narrows the totals to Math-flagged kids only. The
 * `studentsInScope` count is the size of the filtered population — for a
 * campus DRI without a subject filter it equals their roster.
 */
export function dashboardKpis(
  payload: DashboardPayload,
  filters: DashboardFilters
): DashboardKpis {
  const { data, overlay, generatedAt } = payload;
  const students = (data.students || []) as StudentRecord[];

  let critical = 0;
  let attention = 0;
  let onTrack = 0;
  let oldestDays: number | null = null;
  let inScope = 0;
  const now = Date.now();

  for (const s of students) {
    const slug = getSlug(s);
    if (!slug) continue;
    const dd = getDD(data, slug);
    if (filters.subjects.length > 0 && !studentMatchesSubjectFilter(s, dd, filters.subjects)) {
      continue;
    }
    inScope++;
    const u = urgencyOf(s, dd);
    if (u === "critical") critical++;
    else if (u === "attention") attention++;
    else onTrack++;

    if (u !== "on_track" && generatedAt) {
      const entry = overlay.byKey.get(`${slug}::_student`);
      if (!entry) {
        const t = new Date(generatedAt).getTime();
        if (!Number.isNaN(t)) {
          const age = (now - t) / (1000 * 60 * 60 * 24);
          if (age >= 0 && (oldestDays === null || age > oldestDays)) {
            oldestDays = Math.floor(age);
          }
        }
      }
    }
  }

  return {
    critical,
    attention,
    onTrack,
    resolvedThisWeek: overlay.resolvedThisWeek,
    oldestUnacknowledgedDays: oldestDays,
    studentsInScope: inScope,
    dataFreshness: computeFreshness(generatedAt),
  };
}

/** @deprecated alias for `dashboardKpis`. */
export const masterKpis = dashboardKpis;

/* ------------------------------------------------------------------ */
/* Re-exports for callers                                             */
/* ------------------------------------------------------------------ */

export { evidenceChips, suggestedAction, whyNow };
