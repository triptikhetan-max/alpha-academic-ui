/**
 * Triage derivations — pure functions that turn the raw scoped dashboard
 * payload into the small "action cockpit" model the Triage view renders.
 *
 * Design principle (from the handoff): show the smallest set of students
 * and evidence needed to trigger the right human action. Hide everything
 * else behind drill-downs.
 *
 * No I/O, no React, no DOM. Easy to unit-test.
 */
import type { DriScope } from "@/lib/dri-scopes";
import type { DashboardData } from "@/lib/dashboard/scopedData";
import type {
  FeedbackOverlay,
  FeedbackOverlayEntry,
  LifecycleState,
} from "@/lib/dashboard/feedbackOverlay";
import { feedbackKey, lookupLifecycle } from "@/lib/dashboard/feedbackOverlay";

export type Urgency = "critical" | "attention" | "on_track";

export interface EvidenceChip {
  label: string;
  /**
   * Visual variant. Maps to muted maroon/amber/blue/grey in the UI.
   * Values match handoff: doom-loop is the strongest, then test-fail,
   * skipping, low-accuracy, coaching, post-test gap, etc.
   */
  kind:
    | "doom_loop"
    | "test_fail"
    | "low_accuracy"
    | "skipping"
    | "coaching"
    | "post_test_gap"
    | "policy_violation"
    | "neutral";
}

export interface TriageItem {
  /** Stable id used as the React key + URL fragment for "View profile". */
  studentId: string;
  /** Display slug for the legacy student profile route (`#/student/<slug>`). */
  studentSlug: string;
  studentName: string;
  campus: string;
  level: string;
  /** Owner DRI display name — "Owner: Claudio". */
  ownerLabel: string;
  urgency: Urgency;
  whyNow: string;
  evidence: EvidenceChip[];
  suggestedAction: string;
  lifecycleState: LifecycleState;
  /** Timestamp of the latest feedback event, when one exists. */
  lifecycleAt?: string;
  /** Email of the user who last touched this card, when one exists. */
  lifecycleBy?: string;
  /** Subject most strongly flagged on this student, if any (used by filters). */
  primarySubject?: string;
  /** Visible flag chips for the "flag type" filter — internal labels are translated. */
  flagTypes: string[];
}

export interface KpiCounts {
  critical: number;
  attention: number;
  onTrack: number;
  resolvedThisWeek: number;
  oldestUnacknowledgedDays: number | null;
  studentsInScope: number;
  dataFreshness: "fresh" | "partial" | "stale" | "unknown";
}

// ──────────────────────────────────────────────────────────────────────
// Loose typing for student records — the source data is a deep dynamic
// JSON. We type only the fields we actually consume.
// ──────────────────────────────────────────────────────────────────────

interface StudentRecord {
  id?: string;
  slug?: string;
  student_id?: string;
  name?: string;
  campus?: string;
  campus_id?: string;
  level?: string;
  attention_reason?: string;
  coaching_need_tags?: string[];
  flagged_subjects?: Array<{
    subject?: string;
    flags?: string[];
    default_status?: string;
  }>;
  doom_loops?: number;
  total_flag_count?: number;
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
      doom_loops?: number;
      ai_classification?: string;
      timestamp?: string;
    }>;
    doom_loops?: Array<{ subject?: string; test?: string; count?: number }>;
  };
  engagement_diagnosis?: {
    overall?: { status?: string; reason?: string };
    by_subject?: Record<string, { status?: string; reason?: string }>;
  };
  coaching_need?: {
    overdue?: boolean;
    last_coached_days_ago?: number;
    pre?: boolean;
    post?: boolean;
  };
  brain_enrichment?: {
    policy_violations?: Array<{ kind?: string; description?: string }>;
  };
  alphatest_picks?: { by_test_slug?: Record<string, unknown> };
  flagged_subjects?: Array<{ subject?: string; flags?: string[] }>;
  [k: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

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

function ownerForScope(scope: DriScope): string {
  // For PR 2 the only signal we have for "owner DRI" is the caller's own
  // scope. PR 3+ will introduce per-student owner assignment.
  return `Owner: ${scope.name.split(" ")[0]}`;
}

const FLAG_LABELS: Record<string, string> = {
  doom_loop: "Doom loop",
  doom_loops: "Doom loop",
  skipping: "Skipping",
  low_accuracy: "Low accuracy",
  xp_off_track: "XP off track",
  post_test_gap: "Post-test gap",
  pre_test_gap: "Pre-test gap",
  bad_test_suspected: "Bad test suspected",
  coaching_overdue: "Coaching overdue",
  coaching_need_post: "Coaching overdue",
  coaching_need_pre: "Coaching overdue",
  map_target_risk: "MAP target risk",
  data_missing: "Data missing",
  repeat_fail: "Repeat fail",
  repeat_fail_flag_v2: "Repeat fail",
  escaped_doom_loop: "Doom loop",
};

function translateFlag(internal: string): string {
  const k = internal.toLowerCase().trim();
  return FLAG_LABELS[k] || internal.replace(/_/g, " ");
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

/** Three-level urgency from raw signals. No 0-100 score is ever exposed. */
export function urgencyOf(student: StudentRecord, dd?: StudentDD): Urgency {
  const doomCount =
    (dd?.test_history?.doom_loops || []).length ||
    (typeof student.doom_loops === "number" ? student.doom_loops : 0);
  const flaggedSubjects = student.flagged_subjects || [];
  const policyViolations = (dd?.brain_enrichment?.policy_violations || []).length;
  const coachingOverdue = !!dd?.coaching_need?.overdue;
  const engagement = dd?.engagement_diagnosis?.overall?.status || "";
  const recentFails =
    (dd?.test_history?.tests || []).filter((t) => t.passed === false).length;

  // Critical: a real doom loop OR multi-signal escalation.
  if (doomCount >= 1) return "critical";
  if (recentFails >= 2 && (coachingOverdue || policyViolations >= 1)) return "critical";
  if (flaggedSubjects.length >= 3 && coachingOverdue) return "critical";

  // Attention: any flagged subject, coaching overdue, weak engagement, or 1 recent fail.
  if (flaggedSubjects.length >= 1) return "attention";
  if (coachingOverdue) return "attention";
  if (recentFails >= 1) return "attention";
  if (/concern|risk|stuck|skipping/i.test(engagement)) return "attention";

  return "on_track";
}

/** One-line "why now" derived from the strongest available signal. */
export function whyNow(student: StudentRecord, dd?: StudentDD): string {
  const fromAttention =
    typeof student.attention_reason === "string" && student.attention_reason.trim();
  if (fromAttention) return fromAttention;

  const tests = (dd?.test_history?.tests || []).filter((t) => t.passed === false);
  if (tests.length >= 2) {
    const subj = tests[0].label || tests[0].slug || "a recent test";
    return `Failed ${subj} ${tests.length} times in the last cycle without a clean recovery.`;
  }

  const doomLoops = dd?.test_history?.doom_loops || [];
  if (doomLoops.length > 0) {
    const dl = doomLoops[0];
    return `Doom loop detected on ${dl.subject || "a subject"} (${dl.test || "repeat fail"}).`;
  }

  const overall = dd?.engagement_diagnosis?.overall?.reason;
  if (overall) return overall;

  if (dd?.coaching_need?.overdue) {
    const days = dd.coaching_need.last_coached_days_ago;
    return `Coaching overdue${typeof days === "number" ? ` — last coached ${days} days ago.` : "."}`;
  }

  const flagged = (student.flagged_subjects || [])
    .map((f) => f.subject)
    .filter(Boolean)
    .slice(0, 2)
    .join(" + ");
  if (flagged) return `Flagged in ${flagged} this week.`;

  return "No primary signal — review subject breakdown.";
}

/** Top 2-3 evidence chips for the card. */
export function evidenceChips(student: StudentRecord, dd?: StudentDD): EvidenceChip[] {
  const out: EvidenceChip[] = [];

  const doomLoops = dd?.test_history?.doom_loops || [];
  if (doomLoops.length > 0) {
    out.push({
      label: `${doomLoops.length} doom loop${doomLoops.length === 1 ? "" : "s"}`,
      kind: "doom_loop",
    });
  }

  const recentFails = (dd?.test_history?.tests || []).filter((t) => t.passed === false);
  if (recentFails.length > 0 && doomLoops.length === 0) {
    out.push({
      label: `${recentFails.length} recent fail${recentFails.length === 1 ? "" : "s"}`,
      kind: "test_fail",
    });
  }

  if (dd?.coaching_need?.overdue) {
    const days = dd.coaching_need.last_coached_days_ago;
    out.push({
      label:
        typeof days === "number" ? `last coached ${days}d ago` : "coaching overdue",
      kind: "coaching",
    });
  }

  const policyViolations = dd?.brain_enrichment?.policy_violations || [];
  if (policyViolations.length > 0 && out.length < 3) {
    out.push({
      label: `${policyViolations.length} policy issue${
        policyViolations.length === 1 ? "" : "s"
      }`,
      kind: "policy_violation",
    });
  }

  // Subject-level flag chips fill the remaining slot if anything is left.
  if (out.length < 3) {
    const flagged = student.flagged_subjects || [];
    for (const fs of flagged) {
      if (out.length >= 3) break;
      const flag = (fs.flags || [])[0];
      if (!fs.subject || !flag) continue;
      const label = `${fs.subject}: ${translateFlag(flag).toLowerCase()}`;
      out.push({ label, kind: "neutral" });
    }
  }

  return out.slice(0, 3);
}

/** Suggested next action — short, action-shaped sentence. */
export function suggestedAction(student: StudentRecord, dd?: StudentDD): string {
  const doomLoops = dd?.test_history?.doom_loops || [];
  if (doomLoops.length > 0) {
    const dl = doomLoops[0];
    return `15-min guide session on ${dl.subject || "the doom-loop subject"}, then recheck after next XP block.`;
  }

  const recentFails = (dd?.test_history?.tests || []).filter((t) => t.passed === false);
  if (recentFails.length >= 2) {
    return "Review wrong-answer pattern with the student before the next retest.";
  }

  if (dd?.coaching_need?.post) {
    return "Run a post-test coaching session this week.";
  }
  if (dd?.coaching_need?.pre) {
    return "Pre-test coaching before the next assignment.";
  }
  if (dd?.coaching_need?.overdue) {
    return "Schedule a check-in — coaching cadence has slipped.";
  }

  const flagged = student.flagged_subjects || [];
  if (flagged.length >= 1 && flagged[0].subject) {
    return `Quick check on ${flagged[0].subject} accuracy this week.`;
  }

  return "Acknowledge or mark monitoring.";
}

function uniqueFlagTypes(student: StudentRecord, dd?: StudentDD): string[] {
  const set = new Set<string>();
  for (const fs of student.flagged_subjects || []) {
    for (const f of fs.flags || []) set.add(translateFlag(f));
  }
  if ((dd?.test_history?.doom_loops || []).length > 0) set.add("Doom loop");
  if (dd?.coaching_need?.overdue) set.add("Coaching overdue");
  for (const pv of dd?.brain_enrichment?.policy_violations || []) {
    if (pv.kind) set.add(translateFlag(pv.kind));
  }
  return Array.from(set);
}

function lifecycleSummary(
  entry: FeedbackOverlayEntry | null
): { state: LifecycleState; at?: string; by?: string } {
  if (!entry) return { state: "open" };
  return { state: entry.state, at: entry.latestAt, by: entry.latestBy };
}

function urgencyRank(u: Urgency): number {
  if (u === "critical") return 0;
  if (u === "attention") return 1;
  return 2;
}

function lifecycleRank(state: LifecycleState): number {
  // Unacknowledged before acknowledged before in_progress.
  if (state === "open") return 0;
  if (state === "acknowledged") return 1;
  if (state === "in_progress") return 2;
  return 3;
}

/**
 * Build the ranked triage queue for the caller's scope.
 *
 * Sort order (per handoff):
 *   1. Critical before Attention (On Track filtered out by default)
 *   2. Unacknowledged before acknowledged
 *   3. Oldest unacknowledged first
 *   4. Strongest multi-signal concern (more evidence chips wins)
 *   5. Most recent negative event (proxied by evidence count again — we don't
 *      have a stable per-event timestamp at this layer yet)
 *
 * Resolved / Incorrect / Snoozed are removed from the default queue.
 */
export function computeTriageQueue(
  filteredData: DashboardData,
  scope: DriScope,
  overlay: FeedbackOverlay
): TriageItem[] {
  const students = (filteredData.students || []) as StudentRecord[];
  const items: TriageItem[] = [];

  for (const s of students) {
    const slug = getSlug(s);
    if (!slug) continue;
    const dd = getDD(filteredData, slug);
    const urgency = urgencyOf(s, dd);
    if (urgency === "on_track") continue;

    const studentId = slug;
    const lifecycle = lookupLifecycle(overlay, studentId);
    const summary = lifecycleSummary(lifecycle);
    if (
      summary.state === "resolved" ||
      summary.state === "incorrect" ||
      summary.state === "snoozed"
    ) {
      continue;
    }

    const evidence = evidenceChips(s, dd);
    const flagged = s.flagged_subjects || [];
    const primarySubject = flagged[0]?.subject;

    items.push({
      studentId,
      studentSlug: slug,
      studentName: s.name || dd?.identity?.name || slug,
      campus: s.campus || dd?.identity?.campus || s.campus_id || "",
      level: s.level || dd?.identity?.level || "",
      ownerLabel: ownerForScope(scope),
      urgency,
      whyNow: whyNow(s, dd),
      evidence,
      suggestedAction: suggestedAction(s, dd),
      lifecycleState: summary.state,
      lifecycleAt: summary.at,
      lifecycleBy: summary.by,
      primarySubject,
      flagTypes: uniqueFlagTypes(s, dd),
    });
  }

  items.sort((a, b) => {
    const u = urgencyRank(a.urgency) - urgencyRank(b.urgency);
    if (u !== 0) return u;
    const l = lifecycleRank(a.lifecycleState) - lifecycleRank(b.lifecycleState);
    if (l !== 0) return l;
    // Oldest unacknowledged first — entries with no lifecycleAt sort newest-first
    // by absence (treated as oldest unacknowledged).
    const aAt = a.lifecycleAt || "";
    const bAt = b.lifecycleAt || "";
    if (aAt !== bAt) return aAt < bAt ? -1 : 1;
    // More evidence chips = stronger multi-signal concern.
    return b.evidence.length - a.evidence.length;
  });

  return items;
}

/** KPI counts for the strip above the triage queue. */
export function kpiCounts(
  data: DashboardData,
  scope: DriScope,
  overlay: FeedbackOverlay,
  generatedAt?: string
): KpiCounts {
  const students = (data.students || []) as StudentRecord[];

  let critical = 0;
  let attention = 0;
  let onTrack = 0;
  let oldestUnacknowledgedDays: number | null = null;
  const now = Date.now();

  for (const s of students) {
    const slug = getSlug(s);
    if (!slug) continue;
    const dd = getDD(data, slug);
    const urgency = urgencyOf(s, dd);
    if (urgency === "critical") critical++;
    else if (urgency === "attention") attention++;
    else onTrack++;

    if (urgency !== "on_track") {
      const entry = overlay.byKey.get(feedbackKey(slug));
      if (!entry) {
        // No feedback at all → unacknowledged. Use generatedAt as a proxy
        // for "how long has it been unaddressed?".
        if (generatedAt) {
          const age = (now - new Date(generatedAt).getTime()) / (1000 * 60 * 60 * 24);
          if (age >= 0 && (oldestUnacknowledgedDays === null || age > oldestUnacknowledgedDays)) {
            oldestUnacknowledgedDays = Math.floor(age);
          }
        }
      }
    }
  }

  const dataFreshness = computeFreshness(generatedAt);

  return {
    critical,
    attention,
    onTrack,
    resolvedThisWeek: overlay.resolvedThisWeek,
    oldestUnacknowledgedDays,
    studentsInScope: students.length,
    dataFreshness,
  };
}

function computeFreshness(generatedAt?: string): KpiCounts["dataFreshness"] {
  if (!generatedAt) return "unknown";
  const t = new Date(generatedAt).getTime();
  if (Number.isNaN(t)) return "unknown";
  const ageHrs = (Date.now() - t) / (1000 * 60 * 60);
  if (ageHrs < 24) return "fresh";
  if (ageHrs < 48) return "partial";
  return "stale";
}

/**
 * Apply the URL-driven filter set to a triage queue.
 *
 * `state` filters lifecycle state. "open" means default — the resolved/incorrect/
 * snoozed states are already pre-filtered out by `computeTriageQueue`, so this
 * second pass mainly distinguishes Open vs Acknowledged vs In Progress.
 */
export interface TriageFilters {
  campus?: string;
  level?: string;
  subject?: string;
  flagType?: string;
  owner?: string;
  state?: "open" | "acknowledged" | "in_progress";
}

export function applyTriageFilters(
  items: TriageItem[],
  filters: TriageFilters
): TriageItem[] {
  return items.filter((item) => {
    if (filters.campus) {
      const wantCampus = filters.campus.toLowerCase();
      if ((item.campus || "").toLowerCase() !== wantCampus) return false;
    }
    if (filters.level) {
      if ((item.level || "").toUpperCase() !== filters.level.toUpperCase()) return false;
    }
    if (filters.subject) {
      const want = filters.subject.toLowerCase();
      const subjects = [item.primarySubject || ""].filter(Boolean).map((s) => s.toLowerCase());
      if (!subjects.includes(want)) return false;
    }
    if (filters.flagType) {
      const want = filters.flagType.toLowerCase();
      if (!item.flagTypes.some((f) => f.toLowerCase() === want)) return false;
    }
    if (filters.owner) {
      const want = filters.owner.toLowerCase();
      if (!item.ownerLabel.toLowerCase().includes(want)) return false;
    }
    if (filters.state) {
      if (item.lifecycleState !== filters.state) return false;
    }
    return true;
  });
}

/** Distinct subjects across the queue, used to populate the subject filter. */
export function distinctSubjects(items: TriageItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.primarySubject) set.add(item.primarySubject);
  }
  return Array.from(set).sort();
}

/** Distinct flag types, used to populate the flag-type filter. */
export function distinctFlagTypes(items: TriageItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const ft of item.flagTypes) set.add(ft);
  }
  return Array.from(set).sort();
}
