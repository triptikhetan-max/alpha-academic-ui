/**
 * Guide queue — server-side data shaping for the mobile action queue.
 *
 * The Guide View consumes this module. It does NOT touch the dashboard render.js
 * runtime or any of the legacy hash routes — it reads the same private blob
 * (`dashboard/data.json`) via `fetchSourceData`, filters it to the caller's
 * scope, runs the feedback overlay (PR 2) so resolved/in-progress items don't
 * re-appear, and emits a flat list of `GuideAction` cards optimised for a
 * walking-around-classrooms guide.
 *
 * Translation rule: internal signal names (coaching_need.post_test, doom_loop,
 * skip_flag, etc.) are mapped to plain English action labels here. The UI
 * components must NEVER show internal labels.
 *
 * Privacy: this module runs server-side only. It returns derived data already
 * scoped to the caller — never pass the raw `DashboardData` to client code.
 */
import {
  fetchSourceData,
  filterDataForScope,
  isPending,
  type DashboardData,
  type PendingEnvelope,
} from "@/lib/dashboard/scopedData";
import {
  loadFeedbackOverlay,
  feedbackKey,
  type FeedbackOverlay,
  type LifecycleState,
} from "@/lib/dashboard/feedbackOverlay";
import type { DriScope } from "@/lib/dri-scopes";

// ── Public types ────────────────────────────────────────────────────────────

/**
 * Plain-language action label. These are the ONLY strings the UI is allowed
 * to show as the "action type" line on a guide card.
 */
export type GuideActionType =
  | "Quick check"
  | "15-min coaching"
  | "Retest prep"
  | "Parent follow-up"
  | "Guide observation"
  | "Attendance check"
  | "Engagement check"
  | "Post-test follow-up"
  | "Pre-test prep"
  | "Celebrate win";

/** Internal signal kind used to derive the action type. */
export type GuideSignalKind =
  | "coaching_need.post_test"
  | "coaching_need.pre_test"
  | "engagement_diagnosis.disengaged"
  | "doom_loop.bad_prep"
  | "doom_loop.bad_item"
  | "skip_flag"
  | "recent_passes"
  | "finding";

export interface EvidenceChip {
  label: string;
  /** Optional severity hint for styling. */
  severity?: "info" | "warn" | "danger" | "good";
}

export interface GuideAction {
  /**
   * Stable id used as the feedback `flagId`. Format:
   *   `guide:{studentSlug}:{signalKind}[:{discriminator}]`
   * The flagId space is intentionally separate from the legacy "finding:N"
   * ids so the feedback overlay correctly buckets guide events.
   */
  id: string;
  studentId: string;
  studentName: string;
  /** Display location: "Campus · Level". */
  location: string;
  campus: string;
  level: string;
  subject: string | null;
  signal: GuideSignalKind;
  actionType: GuideActionType;
  /** One-line plain-English reason. */
  reason: string;
  /** Exact recommended script or activity. */
  recommendedScript: string;
  /** "5 min" / "15 min" / etc. */
  estimatedTime: string;
  evidenceChips: EvidenceChip[];
  /**
   * Lifecycle state from the feedback overlay. "open" if no event yet.
   * The Guide View hides resolved/incorrect/snoozed by default.
   */
  state: LifecycleState;
  /** True when latest state is `in_progress` (Started but not yet logged). */
  isInProgress: boolean;
  /**
   * `overdue` if the upstream signal flagged this for >3 days and no
   * resolution has been logged. Used for the Overdue chip count.
   */
  isOverdue: boolean;
}

export interface GuideQueueScope {
  scope: DriScope;
}

export interface GuideQueueResult {
  status: "ok" | "data_pending";
  message?: string;
  generatedAt: string;
  /** Open + in-progress + overdue items, sorted highest priority first. */
  items: GuideAction[];
  /** Distinct studentIds covered by `items`. */
  assignedStudents: number;
  toDoCount: number;
  overdueCount: number;
  completedTodayCount: number;
  /** ISO timestamp of the data refresh (or now if unknown). */
  lastRefreshIso: string;
}

// ── Action label translation ────────────────────────────────────────────────

interface SignalContext {
  /** "BAD_PREP" / "BAD_ITEM" / undefined for AI doom-loop classification. */
  doomLoopBlame?: "BAD_PREP" | "BAD_ITEM" | null;
  /** "disengaged" | "on_track" | etc. */
  engagementLabel?: string | null;
}

/**
 * Map an internal signal + minimal context to a plain-English action label.
 *
 * Pure function — no I/O, no data shape assumptions beyond what the caller
 * passes in. Easy to unit-test once we add tests in PR 5.
 */
export function actionTypeFor(
  signal: GuideSignalKind,
  ctx: SignalContext = {}
): GuideActionType {
  switch (signal) {
    case "coaching_need.post_test":
      return "Post-test follow-up";
    case "coaching_need.pre_test":
      return "Pre-test prep";
    case "engagement_diagnosis.disengaged":
      return "Engagement check";
    case "doom_loop.bad_prep":
      return "15-min coaching";
    case "doom_loop.bad_item":
      // Item-blame doom loops mean the kid was tripped up by a bad question;
      // the right move is retest prep, not coaching.
      return "Retest prep";
    case "skip_flag":
      return ctx.engagementLabel === "disengaged"
        ? "Engagement check"
        : "Attendance check";
    case "recent_passes":
      return "Celebrate win";
    case "finding":
    default:
      return "Quick check";
  }
}

// ── Recommended script ──────────────────────────────────────────────────────

const FALLBACK_SCRIPTS: Record<GuideActionType, string> = {
  "Quick check":
    "Sit next to the student. Ask: ‘What are you working on right now? Walk me through the last question you got wrong.’ Listen, then nudge — don’t lecture.",
  "15-min coaching":
    "Pull the student aside. Re-teach the weakest concept using a single concrete example, then have them solve one fresh problem out loud.",
  "Retest prep":
    "Find the test in their queue. Pre-read 2 questions together, point out the trap, then let them retake when they’re ready.",
  "Parent follow-up":
    "Send the parent the latest practice summary and ask for a 10-minute check-in at home tonight.",
  "Guide observation":
    "Watch this student for one full session block. Note: time-on-task, what they do when stuck, what kills momentum.",
  "Attendance check":
    "Find the student physically. Confirm they’re in the right room, on the right device, on the right module.",
  "Engagement check":
    "Pull the student aside. Ask: ‘What’s getting in the way today?’ Listen, then make ONE micro-commitment for the next 30 minutes.",
  "Post-test follow-up":
    "Open the failed test together. Walk through the 2 questions they missed, ask them to explain their reasoning, then mark it for retake.",
  "Pre-test prep":
    "Run a 5-minute warm-up on the standard. Confirm they know what the test is asking before they start.",
  "Celebrate win":
    "Stop by, name the win specifically (‘You passed G3.12 after 3 tries — that’s the kind of grit that compounds’), and log it.",
};

interface ScriptInputs {
  /** AI subject report's recommended_next_step, if available. */
  aiNextStep?: string | null;
  /** Top finding title, if any — used for fallback colour. */
  findingTitle?: string | null;
}

/**
 * Resolve the exact recommended script for a guide card. Prefer the AI
 * subject report's `recommended_next_step` (it's already kid-specific),
 * fall back to a per-action template that's safe to read out loud.
 */
export function recommendedScript(
  actionType: GuideActionType,
  inputs: ScriptInputs = {}
): string {
  const ai = (inputs.aiNextStep || "").trim();
  if (ai) return ai;
  const base = FALLBACK_SCRIPTS[actionType];
  if (inputs.findingTitle) {
    return `${base}\n\nFocus area: ${inputs.findingTitle}`;
  }
  return base;
}

// ── Estimated time ──────────────────────────────────────────────────────────

const ESTIMATED_TIME: Record<GuideActionType, string> = {
  "Quick check": "5 min",
  "15-min coaching": "15 min",
  "Retest prep": "10 min",
  "Parent follow-up": "5 min",
  "Guide observation": "20 min",
  "Attendance check": "2 min",
  "Engagement check": "5 min",
  "Post-test follow-up": "10 min",
  "Pre-test prep": "5 min",
  "Celebrate win": "2 min",
};

export function estimatedTime(actionType: GuideActionType): string {
  return ESTIMATED_TIME[actionType] ?? "5 min";
}

// ── Evidence chips ──────────────────────────────────────────────────────────

interface EvidenceInputs {
  doomLoopCount?: number;
  recentPassesCount?: number;
  lastCoachingDaysAgo?: number | null;
  weakStandard?: string | null;
  policyViolations?: number;
  engagementLabel?: string | null;
}

/**
 * Build 2-3 evidence chips to back up the action. Returns at most 3 chips,
 * ordered by salience.
 */
export function evidenceChips(inputs: EvidenceInputs): EvidenceChip[] {
  const chips: EvidenceChip[] = [];
  if (inputs.doomLoopCount && inputs.doomLoopCount > 0) {
    chips.push({
      label: `${inputs.doomLoopCount} doom loop${
        inputs.doomLoopCount === 1 ? "" : "s"
      }`,
      severity: "danger",
    });
  }
  if (inputs.weakStandard) {
    chips.push({ label: inputs.weakStandard, severity: "warn" });
  }
  if (inputs.engagementLabel && inputs.engagementLabel !== "on_track") {
    chips.push({
      label: inputs.engagementLabel.replace(/_/g, " "),
      severity: "warn",
    });
  }
  if (
    inputs.lastCoachingDaysAgo != null &&
    inputs.lastCoachingDaysAgo >= 0
  ) {
    chips.push({
      label: `last coached ${inputs.lastCoachingDaysAgo}d ago`,
      severity: "info",
    });
  }
  if (inputs.policyViolations && inputs.policyViolations > 0) {
    chips.push({
      label: `${inputs.policyViolations} policy violation${
        inputs.policyViolations === 1 ? "" : "s"
      }`,
      severity: "danger",
    });
  }
  if (inputs.recentPassesCount && inputs.recentPassesCount > 0) {
    chips.push({
      label: `${inputs.recentPassesCount} recent pass${
        inputs.recentPassesCount === 1 ? "" : "es"
      }`,
      severity: "good",
    });
  }
  return chips.slice(0, 3);
}

// ── Internal: walk a student's deep-dive into guide actions ─────────────────

interface StudentDD {
  id?: string;
  identity?: { campus?: string; level?: string; tier?: string; name?: string };
  coaching_need?: { post_test?: boolean; pre_test?: boolean };
  engagement_diagnosis?: {
    overall?: { label?: string; severity?: string };
    by_subject?: Record<
      string,
      { label?: string; severity?: string; rationale?: string }
    >;
  };
  test_history?: {
    tests?: Array<{
      doom_loop?: boolean;
      n_attempts?: number;
      passed?: boolean;
      ai_blame?: "BAD_PREP" | "BAD_ITEM" | null;
      subject?: string;
      standard?: string;
    }>;
  };
  brain_enrichment?: {
    policy_violations?: unknown[];
    last_coaching_days_ago?: number;
  };
  flagged_subjects?: Array<{ subject?: string }>;
  recent_passes?: Array<{ subject?: string }>;
  findings?: Array<{ title?: string; subject?: string; severity?: string }>;
  subject_breakdown?: Array<{
    subject?: string;
    doom_loops?: number;
    ai_subject_report?: {
      recommended_next_step?: string | null;
      pattern_label?: string | null;
      weakest_concepts?: Array<{ concept?: string }>;
    };
  }>;
  skip_flag?: boolean;
  attendance_flag?: boolean;
}

interface RawStudent {
  id?: string;
  slug?: string;
  student_id?: string;
  name?: string;
  display_name?: string;
  campus_id?: string;
  campus?: string;
  level?: string;
}

interface ResolvedStudent {
  id: string;
  name: string;
  campus: string;
  level: string;
  dd: StudentDD;
}

function resolveStudents(data: DashboardData): ResolvedStudent[] {
  const students = Array.isArray(data.students)
    ? (data.students as RawStudent[])
    : [];
  const dds = (data.student_dds || {}) as Record<string, StudentDD>;
  const out: ResolvedStudent[] = [];

  for (const s of students) {
    const id = s.id || s.slug || s.student_id || "";
    if (!id) continue;
    const dd = dds[id] || dds[s.slug ?? ""] || ({} as StudentDD);
    const ident = dd.identity || {};
    out.push({
      id,
      name: s.display_name || s.name || ident.name || id,
      campus: s.campus || s.campus_id || ident.campus || "—",
      level: s.level || ident.level || "—",
      dd,
    });
  }

  // Some envelopes only populate student_dds (older data). Fold in any DDs
  // that don't have a matching students[] row so guides don't lose kids.
  if (out.length === 0) {
    for (const [slug, dd] of Object.entries(dds)) {
      const ident = dd.identity || {};
      out.push({
        id: dd.id || slug,
        name: ident.name || slug,
        campus: ident.campus || "—",
        level: ident.level || "—",
        dd,
      });
    }
  }
  return out;
}

interface BuildContext {
  overlay: FeedbackOverlay;
  todayBucket: string;
}

const OVERDUE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

function classifyState(
  studentId: string,
  flagId: string,
  overlay: FeedbackOverlay
): LifecycleState {
  if (!overlay.available) return "open";
  const entry = overlay.byKey.get(feedbackKey(studentId, flagId));
  return entry?.state ?? "open";
}

function pickAiNextStep(dd: StudentDD, subject?: string | null): string | null {
  const subs = dd.subject_breakdown || [];
  if (subject) {
    const hit = subs.find(
      (s) =>
        (s.subject || "").toLowerCase() === subject.toLowerCase() &&
        s.ai_subject_report?.recommended_next_step
    );
    if (hit?.ai_subject_report?.recommended_next_step) {
      return hit.ai_subject_report.recommended_next_step;
    }
  }
  // Fall back to any subject with a recommended next step.
  const any = subs.find((s) => s.ai_subject_report?.recommended_next_step);
  return any?.ai_subject_report?.recommended_next_step ?? null;
}

function pickWeakStandard(dd: StudentDD, subject?: string | null): string | null {
  const tests = dd.test_history?.tests || [];
  if (subject) {
    const hit = tests.find(
      (t) =>
        (t.subject || "").toLowerCase() === subject.toLowerCase() && t.standard
    );
    if (hit?.standard) return hit.standard;
  }
  const any = tests.find((t) => t.standard);
  return any?.standard ?? null;
}

function pickEngagementLabel(
  dd: StudentDD,
  subject?: string | null
): string | null {
  const engBySubj = dd.engagement_diagnosis?.by_subject || {};
  if (subject && engBySubj[subject]?.label) return engBySubj[subject].label!;
  return dd.engagement_diagnosis?.overall?.label ?? null;
}

function pushAction(
  acc: GuideAction[],
  student: ResolvedStudent,
  signal: GuideSignalKind,
  ctx: SignalContext,
  partial: {
    discriminator?: string;
    subject?: string | null;
    reason: string;
    evidenceInputs: EvidenceInputs;
    findingTitle?: string | null;
  },
  build: BuildContext
) {
  const actionType = actionTypeFor(signal, ctx);
  const flagId = `guide:${student.id}:${signal}${
    partial.discriminator ? `:${partial.discriminator}` : ""
  }`;
  const state = classifyState(student.id, flagId, build.overlay);

  // Hide things the guide already finished today.
  if (state === "resolved" || state === "incorrect" || state === "snoozed") {
    return;
  }

  const aiNextStep = pickAiNextStep(student.dd, partial.subject ?? null);
  const script = recommendedScript(actionType, {
    aiNextStep,
    findingTitle: partial.findingTitle ?? null,
  });

  // Overdue heuristic: latest event > 3d old AND not resolved. For an item
  // with no event yet we treat the data refresh time as the start; we don't
  // have it here, so leave isOverdue false and let server-side data drive it
  // when the data envelope grows a `flag_opened_at`.
  const entry = build.overlay.byKey.get(feedbackKey(student.id, flagId));
  let isOverdue = false;
  if (entry && entry.latestAt) {
    const ageMs = Date.now() - new Date(entry.latestAt).getTime();
    isOverdue = ageMs > OVERDUE_THRESHOLD_MS;
  }

  acc.push({
    id: flagId,
    studentId: student.id,
    studentName: student.name,
    location: `${student.campus} · ${student.level}`,
    campus: student.campus,
    level: student.level,
    subject: partial.subject ?? null,
    signal,
    actionType,
    reason: partial.reason,
    recommendedScript: script,
    estimatedTime: estimatedTime(actionType),
    evidenceChips: evidenceChips(partial.evidenceInputs),
    state,
    isInProgress: state === "in_progress",
    isOverdue,
  });
}

function buildActionsForStudent(
  student: ResolvedStudent,
  build: BuildContext
): GuideAction[] {
  const acc: GuideAction[] = [];
  const dd = student.dd;
  const cn = dd.coaching_need || {};
  const tests = dd.test_history?.tests || [];
  const doomTests = tests.filter(
    (t) => t.doom_loop || ((t.n_attempts || 0) >= 3 && !t.passed)
  );
  const recentPasses = (dd.recent_passes || []).length;
  const overall = dd.engagement_diagnosis?.overall || {};
  const lastCoaching = dd.brain_enrichment?.last_coaching_days_ago ?? null;
  const policyV = (dd.brain_enrichment?.policy_violations || []).length;
  const flaggedSubjects = (dd.flagged_subjects || [])
    .map((f) => f.subject)
    .filter((s): s is string => Boolean(s));
  const primarySubject = flaggedSubjects[0] ?? null;

  // 1) Coaching gaps (the highest-priority guide action).
  if (cn.post_test) {
    pushAction(
      acc,
      student,
      "coaching_need.post_test",
      {},
      {
        subject: primarySubject,
        reason:
          "Failed a recent test and no coaching has been logged since.",
        evidenceInputs: {
          doomLoopCount: doomTests.length,
          weakStandard: pickWeakStandard(dd, primarySubject),
          lastCoachingDaysAgo: lastCoaching,
        },
      },
      build
    );
  }
  if (cn.pre_test) {
    pushAction(
      acc,
      student,
      "coaching_need.pre_test",
      {},
      {
        subject: primarySubject,
        reason: "Approaching a test with weak prep history.",
        evidenceInputs: {
          weakStandard: pickWeakStandard(dd, primarySubject),
          lastCoachingDaysAgo: lastCoaching,
        },
      },
      build
    );
  }

  // 2) Doom loops — split by AI blame.
  doomTests.forEach((t, idx) => {
    const blame = t.ai_blame ?? null;
    const isBadItem = blame === "BAD_ITEM";
    const signal: GuideSignalKind = isBadItem
      ? "doom_loop.bad_item"
      : "doom_loop.bad_prep";
    pushAction(
      acc,
      student,
      signal,
      { doomLoopBlame: blame },
      {
        discriminator: String(idx),
        subject: t.subject || primarySubject,
        reason: isBadItem
          ? "Stuck on a test that looks like a bad item — kid not at fault."
          : `Stuck on ${t.standard || "this test"} after ${
              t.n_attempts || 3
            }+ attempts.`,
        evidenceInputs: {
          doomLoopCount: 1,
          weakStandard: t.standard ?? null,
          lastCoachingDaysAgo: lastCoaching,
          engagementLabel: pickEngagementLabel(dd, t.subject ?? null),
        },
      },
      build
    );
  });

  // 3) Disengagement.
  if (overall.label && overall.label === "disengaged") {
    pushAction(
      acc,
      student,
      "engagement_diagnosis.disengaged",
      { engagementLabel: overall.label },
      {
        subject: primarySubject,
        reason: "Engagement signal flipped to disengaged.",
        evidenceInputs: {
          engagementLabel: overall.label,
          lastCoachingDaysAgo: lastCoaching,
          doomLoopCount: doomTests.length,
        },
      },
      build
    );
  }

  // 4) Skip / attendance.
  if (dd.skip_flag || dd.attendance_flag) {
    pushAction(
      acc,
      student,
      "skip_flag",
      { engagementLabel: overall.label ?? null },
      {
        reason: "Looks like the kid skipped or wasn’t in their session.",
        evidenceInputs: {
          engagementLabel: overall.label ?? null,
        },
      },
      build
    );
  }

  // 5) Celebrate wins.
  if (recentPasses >= 1 && doomTests.length === 0 && policyV === 0) {
    pushAction(
      acc,
      student,
      "recent_passes",
      {},
      {
        reason: `${recentPasses} recent pass${
          recentPasses === 1 ? "" : "es"
        } in the last 14 days — name it.`,
        evidenceInputs: {
          recentPassesCount: recentPasses,
        },
      },
      build
    );
  }

  // 6) Fallback: top finding becomes a Quick check if nothing else fired.
  if (acc.length === 0) {
    const f0 = (dd.findings || [])[0];
    if (f0?.title) {
      pushAction(
        acc,
        student,
        "finding",
        {},
        {
          subject: f0.subject ?? primarySubject,
          reason: f0.title,
          findingTitle: f0.title,
          evidenceInputs: {
            doomLoopCount: doomTests.length,
            weakStandard: pickWeakStandard(dd, f0.subject ?? primarySubject),
            engagementLabel: overall.label ?? null,
          },
        },
        build
      );
    }
  }

  return acc;
}

// ── Sorting ─────────────────────────────────────────────────────────────────

const ACTION_TYPE_PRIORITY: Record<GuideActionType, number> = {
  "15-min coaching": 0,
  "Post-test follow-up": 1,
  "Retest prep": 2,
  "Pre-test prep": 3,
  "Engagement check": 4,
  "Attendance check": 5,
  "Quick check": 6,
  "Guide observation": 7,
  "Parent follow-up": 8,
  "Celebrate win": 9,
};

function priorityScore(a: GuideAction): number {
  const base = ACTION_TYPE_PRIORITY[a.actionType] ?? 99;
  // Overdue items float to the top.
  if (a.isOverdue) return base - 100;
  // In-progress items just below open priority items so the guide can finish.
  if (a.isInProgress) return base + 0.5;
  return base;
}

// ── Public entry point ──────────────────────────────────────────────────────

interface LoadOptions {
  /** Override "now" for tests / digest cron jobs. */
  now?: Date;
  /** Pre-fetched data envelope (used by tests). */
  preloadedData?: DashboardData | PendingEnvelope;
  preloadedOverlay?: FeedbackOverlay;
}

/**
 * Build the guide queue for the caller's scope.
 *
 * Master scopes (Tripti) see ALL students. Campus/level-bound scopes are
 * filtered server-side via `filterDataForScope`. Future "guide" scopes will
 * add a per-guide assignment list — for PR 3 that subset is the same as the
 * campus/level scope.
 */
export async function loadGuideQueue(
  input: GuideQueueScope,
  options: LoadOptions = {}
): Promise<GuideQueueResult> {
  const now = options.now ?? new Date();
  const todayBucket = now.toISOString().slice(0, 10);

  const data = options.preloadedData ?? (await fetchSourceData());
  if (isPending(data)) {
    return {
      status: "data_pending",
      message: data.message,
      generatedAt: now.toISOString(),
      items: [],
      assignedStudents: 0,
      toDoCount: 0,
      overdueCount: 0,
      completedTodayCount: 0,
      lastRefreshIso: now.toISOString(),
    };
  }

  const scoped = filterDataForScope(data, input.scope);
  const overlay =
    options.preloadedOverlay ?? (await loadFeedbackOverlay(input.scope, { days: 7 }));
  const build: BuildContext = { overlay, todayBucket };

  const students = resolveStudents(scoped);
  const items: GuideAction[] = [];
  for (const student of students) {
    items.push(...buildActionsForStudent(student, build));
  }

  items.sort((a, b) => priorityScore(a) - priorityScore(b));

  // KPI counters
  const assignedStudents = new Set(items.map((i) => i.studentId)).size;
  const toDoCount = items.filter(
    (i) => i.state === "open" || i.state === "acknowledged"
  ).length;
  const overdueCount = items.filter((i) => i.isOverdue).length;

  // Completed today: any feedback event with action=resolved + sourceView=guide_queue
  // logged against this scope today. We count overlay entries whose latest
  // state is `resolved` and whose latestAt is within today.
  let completedTodayCount = 0;
  if (overlay.available) {
    overlay.byKey.forEach((entry) => {
      if (entry.state !== "resolved") return;
      if (entry.latestAt.slice(0, 10) !== todayBucket) return;
      // Only count flags that look like guide-flag ids (PR 3 namespace).
      const last = entry.events[entry.events.length - 1];
      if (last?.flagId && last.flagId.startsWith("guide:")) {
        completedTodayCount += 1;
      }
    });
  }

  return {
    status: "ok",
    generatedAt: now.toISOString(),
    items,
    assignedStudents,
    toDoCount,
    overdueCount,
    completedTodayCount,
    lastRefreshIso: now.toISOString(),
  };
}
