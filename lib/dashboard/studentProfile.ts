/**
 * Student profile derivations — server-side helpers that turn the raw
 * scoped dashboard payload into the denormalized model the unified
 * Campus DRI student profile view renders.
 *
 * Design principle (per handoff): show every meaningful data point about
 * one kid in a single scrollable view. Above-the-fold = identity + current
 * concern + recommended action + open flags. Below-the-fold = evidence
 * timeline → subjects → tests → coaching → MAP → raw.
 *
 * No I/O, no React, no DOM — easy to unit-test.
 */
import type { DriScope } from "@/lib/dri-scopes";
import type { DashboardData } from "@/lib/dashboard/scopedData";
import { isStudentInScope } from "@/lib/dashboard/scopedData";
import {
  type FeedbackOverlay,
  type FeedbackOverlayEntry,
  type LifecycleState,
  feedbackKey,
} from "@/lib/dashboard/feedbackOverlay";

// ──────────────────────────────────────────────────────────────────────
// Loose types — the upstream JSON is deeply dynamic. We only type the
// fields we consume. `unknown` everywhere else.
// ──────────────────────────────────────────────────────────────────────

export type EvidenceSource =
  | "AlphaTest"
  | "QTI"
  | "Timeback"
  | "Coaching"
  | "MAP"
  | "AI";

export interface StudentIdentity {
  slug: string;
  name: string;
  campus: string;
  level: string;
  grade?: string | number;
  workingGrade?: string | number;
  tier?: string;
  email?: string;
  phone?: string;
  coach?: string;
  guardians: Array<{ name?: string; email?: string; phone?: string; role?: string }>;
}

export interface SubjectBreakdownItem {
  subject: string;
  mapRit?: number | null;
  gradeGap?: string | number | null;
  appEnrollment?: string | null;
  courseType?: string | null;
  xpRemaining?: number | null;
  accuracy?: number | null;
  accuracyDecreasing?: boolean;
  dailyMinutes?: number | null;
  skipFlag?: boolean;
  repeatFailFlag?: boolean;
  aiSubjectReport?: string | null;
  aiReportFreshnessDays?: number | null;
  flags: string[];
  defaultStatus?: string | null;
}

export interface TestEntry {
  slug?: string;
  label?: string;
  subject?: string;
  score?: number | null;
  passed?: boolean | null;
  attempts?: number | null;
  doomLoop?: boolean;
  aiClassification?: string | null;
  aiNarrative?: string | null;
  timestamp?: string | null;
}

export interface WrongPickEntry {
  testSlug: string;
  prompt: string;
  pickedText: string;
  correctText: string;
  standards: string[];
  attemptsCount?: number | null;
}

export interface CoachingEntry {
  date?: string | null;
  subject?: string | null;
  coach?: string | null;
  aiSummary?: string | null;
  outcomeQuality?: string | null;
  pattern?: string | null;
  recommendedFollowup?: string | null;
}

export interface TimelineEvent {
  date: string;
  source: EvidenceSource;
  summary: string;
}

export interface MapTargetData {
  bySubject: Array<{
    subject: string;
    rit?: number | null;
    target?: number | null;
    growthGap?: number | null;
    trajectory?: string | null;
  }>;
  hasData: boolean;
}

export interface OpenFlag {
  /** Stable key used as flagId for feedback events. */
  flagId: string;
  label: string;
  subject?: string;
  severity: "critical" | "attention" | "info";
  source: EvidenceSource;
  /** Lifecycle state from the feedback overlay (or "open" when no event). */
  state: LifecycleState;
  /** When the latest feedback event for this flag was logged. */
  stateAt?: string;
  /** Who logged the latest feedback event. */
  stateBy?: string;
  /** Plain-language one-liner explaining the flag. */
  detail?: string;
}

export interface StudentProfile {
  identity: StudentIdentity;
  subjectBreakdown: SubjectBreakdownItem[];
  tests: TestEntry[];
  wrongPicks: WrongPickEntry[];
  coachingEvents: CoachingEntry[];
  mapTargets: MapTargetData;
  findings: Array<{ title?: string; severity?: string; subject?: string; detail?: string }>;
  policyViolations: Array<{ kind?: string; description?: string }>;
  recentPasses: Array<{
    test?: string;
    score?: number;
    date?: string;
    escapedDoomLoop?: boolean;
  }>;
  flaggedSubjects: Array<{
    subject: string;
    flags: string[];
    defaultStatus?: string;
  }>;
  liveActivityByDay: Record<string, unknown>;
  lessonLogByDate: Record<string, unknown>;
  lessonLogTotalsByPlatform: Record<string, unknown>;
  engagementOverall?: { status?: string; reason?: string; severity?: string; label?: string };
  engagementBySubject: Record<string, { status?: string; reason?: string }>;
  attentionReason?: string;
  coachingNeed?: {
    pre?: boolean;
    post?: boolean;
    academic?: boolean;
    overdue?: boolean;
    lastCoachedDaysAgo?: number;
    reasons?: string[];
  };
  actionPlanBuckets: {
    thisWeek: unknown[];
    thisMonth: unknown[];
    watch: unknown[];
  };
  escalations: unknown[];
  brainEnrichment: {
    badTestWarnings?: unknown[];
    subjectDriLookup?: unknown;
    platformDriLookup?: unknown;
  };
  /** ISO timestamp of when the upstream data was generated, when known. */
  dataGeneratedAt?: string;
}

// ──────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────

interface RawDD {
  id?: string;
  identity?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  subject_breakdown?: Array<Record<string, unknown>>;
  test_history?: { tests?: Array<Record<string, unknown>>; doom_loops?: unknown[] };
  test_patterns?: { weak_topics?: unknown[] };
  question_patterns?: { top_missed?: Array<Record<string, unknown>> };
  alphatest_picks?: { by_test_slug?: Record<string, unknown> };
  coaching_history?: { events?: Array<Record<string, unknown>>; event_count?: number };
  live_activity?: { by_day?: Record<string, unknown>; reconciliation?: unknown };
  lesson_log?: {
    by_date?: Record<string, unknown>;
    totals?: { by_platform?: Record<string, unknown> };
  };
  map_targets?: Record<string, unknown>;
  engagement_diagnosis?: {
    overall?: Record<string, unknown>;
    by_subject?: Record<string, Record<string, unknown>>;
  };
  findings?: Array<Record<string, unknown>>;
  action_plan_buckets?: {
    this_week?: unknown[];
    this_month?: unknown[];
    watch?: unknown[];
  };
  escalations?: unknown[];
  brain_enrichment?: {
    policy_violations?: unknown[];
    bad_test_warnings?: unknown[];
    subject_dri_lookup?: unknown;
    platform_dri_lookup?: unknown;
  };
  recent_passes?: Array<Record<string, unknown>>;
  attention_reason?: string;
  coaching_need?: Record<string, unknown>;
  flagged_subjects?: Array<Record<string, unknown>>;
  ai_synthesis_generated_at?: string;
  [k: string]: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function findStudentRecord(
  data: DashboardData,
  slug: string
): { dd: RawDD | undefined; listRow: Record<string, unknown> | undefined } {
  const dds = (data.student_dds || {}) as Record<string, RawDD>;
  const dd =
    dds[slug] ||
    Object.values(dds).find(
      (d) => typeof d?.id === "string" && d.id.toLowerCase() === slug.toLowerCase()
    );
  const listRow = (data.students || []).find((s) => {
    const candidates = [
      s.id,
      s.slug,
      s.student_id as string | undefined,
    ].filter((v): v is string => typeof v === "string");
    return candidates.some((v) => v.toLowerCase() === slug.toLowerCase());
  }) as Record<string, unknown> | undefined;
  return { dd, listRow };
}

function buildIdentity(
  slug: string,
  dd: RawDD | undefined,
  listRow: Record<string, unknown> | undefined
): StudentIdentity {
  const id = asRecord(dd?.identity);
  const ct = asRecord(dd?.contact);
  const guardiansRaw = asArray<Record<string, unknown>>(ct.guardians);
  const guardians = guardiansRaw
    .map((g) => ({
      name: asString(g.name),
      email: asString(g.email),
      phone: asString(g.phone),
      role: asString(g.role),
    }))
    .filter((g) => g.name || g.email || g.phone);

  return {
    slug,
    name:
      asString(id.name) ||
      asString(id.full_name) ||
      asString(listRow?.name) ||
      slug,
    campus:
      asString(id.campus) ||
      asString(listRow?.campus) ||
      asString(listRow?.campus_id) ||
      "",
    level:
      asString(id.level) ||
      asString(listRow?.level) ||
      "",
    grade: (id.grade as string | number | undefined) ?? (listRow?.grade as string | number | undefined),
    workingGrade:
      (id.working_grade as string | number | undefined) ??
      (id.working_level as string | number | undefined),
    tier: asString(id.tier) || asString(listRow?.tier),
    email: asString(ct.email) || asString(id.email),
    phone: asString(ct.phone) || asString(id.phone),
    coach: asString(id.coach),
    guardians,
  };
}

function buildSubjectBreakdown(dd: RawDD | undefined): SubjectBreakdownItem[] {
  const list = asArray<Record<string, unknown>>(dd?.subject_breakdown);
  return list
    .filter((s) => asString(s.subject))
    .map((s) => {
      const flags = asArray<string>(s.flags).filter((f): f is string => typeof f === "string");
      const aiReport =
        asRecord(s.ai_subject_report || s.ai_report) ||
        ({} as Record<string, unknown>);
      const aiText =
        asString(s.ai_subject_report) ||
        asString(aiReport.summary) ||
        asString(aiReport.text) ||
        null;
      const aiAt =
        asString(aiReport.generated_at) ||
        asString(s.ai_generated_at) ||
        asString(dd?.ai_synthesis_generated_at);
      const aiAgeDays = aiAt ? daysBetween(aiAt, new Date().toISOString()) : null;

      return {
        subject: asString(s.subject) || "",
        mapRit: asNumber(s.map_rit) ?? asNumber(s.rit) ?? null,
        gradeGap:
          (s.grade_gap as string | number | undefined) ??
          (s.gap as string | number | undefined) ??
          null,
        appEnrollment: asString(s.app_enrollment) || asString(s.app) || null,
        courseType: asString(s.course_type) || null,
        xpRemaining: asNumber(s.xp_remaining) ?? null,
        accuracy: asNumber(s.accuracy) ?? null,
        accuracyDecreasing: asBool(s.accuracy_decreasing) || asBool(s.accuracy_falling),
        dailyMinutes: asNumber(s.daily_minutes) ?? asNumber(s.minutes_per_day) ?? null,
        skipFlag: asBool(s.skip_flag) || asBool(s.skipping),
        repeatFailFlag: asBool(s.repeat_fail_flag) || asBool(s.repeat_fail),
        aiSubjectReport: aiText,
        aiReportFreshnessDays: aiAgeDays,
        flags,
        defaultStatus: asString(s.default_status) || null,
      };
    });
}

function buildTests(dd: RawDD | undefined): TestEntry[] {
  return asArray<Record<string, unknown>>(dd?.test_history?.tests).map((t) => ({
    slug: asString(t.slug),
    label: asString(t.label) || asString(t.name) || asString(t.slug),
    subject: asString(t.subject),
    score: asNumber(t.score) ?? null,
    passed: typeof t.passed === "boolean" ? (t.passed as boolean) : null,
    attempts: asNumber(t.n_attempts) ?? asNumber(t.attempts) ?? null,
    doomLoop: asBool(t.doom_loop),
    aiClassification: asString(t.ai_classification) || null,
    aiNarrative: asString(t.ai_narrative) || asString(t.ai_summary) || null,
    timestamp: asString(t.timestamp) || asString(t.date) || null,
  }));
}

function buildWrongPicks(dd: RawDD | undefined): WrongPickEntry[] {
  const bySlug = asRecord(dd?.alphatest_picks?.by_test_slug);
  const out: WrongPickEntry[] = [];
  for (const [testSlug, raw] of Object.entries(bySlug)) {
    const picks = asArray<Record<string, unknown>>(
      asRecord(raw).top_wrong_picks ||
        asRecord(raw).picks ||
        asRecord(raw).wrong_picks
    );
    for (const p of picks) {
      const alignment = asRecord(p.alignment);
      const standards = asArray<string>(alignment.standards).filter(
        (s): s is string => typeof s === "string"
      );
      out.push({
        testSlug,
        prompt: asString(p.prompt) || asString(p.question) || "",
        pickedText: asString(p.picked_text) || asString(p.picked) || "",
        correctText: asString(p.correct_text) || asString(p.correct) || "",
        standards,
        attemptsCount: asNumber(p.attempts) ?? asNumber(p.n_attempts) ?? null,
      });
    }
  }
  // Top 12 by attempts count, then by prompt presence.
  return out
    .filter((w) => w.prompt || w.pickedText)
    .sort((a, b) => (b.attemptsCount ?? 0) - (a.attemptsCount ?? 0))
    .slice(0, 12);
}

function buildCoachingEvents(dd: RawDD | undefined): CoachingEntry[] {
  return asArray<Record<string, unknown>>(dd?.coaching_history?.events)
    .map((e) => ({
      date: asString(e.date) || asString(e.timestamp) || null,
      subject: asString(e.subject) || null,
      coach: asString(e.coach) || asString(e.coach_name) || null,
      aiSummary: asString(e.ai_summary) || asString(e.summary) || null,
      outcomeQuality: asString(e.outcome_quality) || asString(e.outcome) || null,
      pattern: asString(e.pattern) || asString(e.coaching_pattern) || null,
      recommendedFollowup:
        asString(e.recommended_followup) ||
        asString(e.followup) ||
        null,
    }))
    .sort((a, b) => {
      const ad = a.date || "";
      const bd = b.date || "";
      return ad < bd ? 1 : ad > bd ? -1 : 0;
    });
}

function buildMapTargets(dd: RawDD | undefined): MapTargetData {
  const map = asRecord(dd?.map_targets);
  const bySubject = asArray<Record<string, unknown>>(
    map.by_subject || map.subjects || []
  );
  const items = bySubject
    .map((row) => ({
      subject: asString(row.subject) || "",
      rit: asNumber(row.rit) ?? asNumber(row.current_rit) ?? null,
      target: asNumber(row.target) ?? asNumber(row.target_rit) ?? null,
      growthGap:
        asNumber(row.growth_gap) ??
        asNumber(row.target_gap) ??
        asNumber(row.gap) ??
        null,
      trajectory: asString(row.trajectory) || asString(row.label) || null,
    }))
    .filter((r) => r.subject);
  return {
    bySubject: items,
    hasData:
      items.length > 0 ||
      Object.keys(map).length > 0,
  };
}

function buildFindings(dd: RawDD | undefined) {
  return asArray<Record<string, unknown>>(dd?.findings).map((f) => ({
    title: asString(f.title),
    severity: asString(f.severity),
    subject: asString(f.subject),
    detail: asString(f.detail) || asString(f.summary),
  }));
}

function buildRecentPasses(dd: RawDD | undefined) {
  return asArray<Record<string, unknown>>(dd?.recent_passes).map((p) => ({
    test: asString(p.test) || asString(p.label) || asString(p.slug),
    score: asNumber(p.score),
    date: asString(p.date) || asString(p.timestamp),
    escapedDoomLoop: asBool(p.escaped_doom_loop),
  }));
}

function buildCoachingNeed(dd: RawDD | undefined) {
  const cn = asRecord(dd?.coaching_need);
  if (Object.keys(cn).length === 0) return undefined;
  return {
    pre: asBool(cn.pre) || asBool(cn.pre_test),
    post: asBool(cn.post) || asBool(cn.post_test),
    academic: asBool(cn.academic),
    overdue: asBool(cn.overdue),
    lastCoachedDaysAgo:
      asNumber(cn.last_coached_days_ago) ?? asNumber(cn.days_since) ?? undefined,
    reasons: asArray<string>(cn.reasons).filter((r): r is string => typeof r === "string"),
  };
}

function buildFlaggedSubjects(
  listRow: Record<string, unknown> | undefined,
  dd: RawDD | undefined
) {
  const raw =
    asArray<Record<string, unknown>>(listRow?.flagged_subjects) ||
    asArray<Record<string, unknown>>(dd?.flagged_subjects);
  return raw
    .filter((f) => asString(f.subject))
    .map((f) => ({
      subject: asString(f.subject) || "",
      flags: asArray<string>(f.flags).filter((x): x is string => typeof x === "string"),
      defaultStatus: asString(f.default_status),
    }));
}

function daysBetween(from: string, to: string): number | null {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

export interface LoadStudentProfileResult {
  /** "ok" → profile present; "not_found" → slug missing; "out_of_scope" → 403. */
  status: "ok" | "not_found" | "out_of_scope" | "data_pending";
  profile?: StudentProfile;
  message?: string;
}

/**
 * Load a fully denormalized student profile, gated by scope.
 *
 * Returns one of three statuses so the caller can render a 403, 404, or
 * data-pending state without leaking information about kids the caller
 * cannot see (scope-fail and not-found are kept separate intentionally —
 * the server still distinguishes them, but UI strings should treat them
 * with the same "no data" framing if desired).
 */
export function loadStudentProfile(
  data: DashboardData,
  scope: DriScope,
  slug: string
): LoadStudentProfileResult {
  if (!slug) return { status: "not_found" };

  // Scope is verified server-side. `isStudentInScope` returns true for the
  // master scope (Tripti).
  if (!isStudentInScope(data, scope, slug)) {
    return { status: "out_of_scope" };
  }

  const { dd, listRow } = findStudentRecord(data, slug);
  if (!dd && !listRow) {
    return { status: "not_found" };
  }

  const generatedAt =
    asString((data as Record<string, unknown>).generated_at) ||
    asString((data as Record<string, unknown>).refresh_id);

  const profile: StudentProfile = {
    identity: buildIdentity(slug, dd, listRow),
    subjectBreakdown: buildSubjectBreakdown(dd),
    tests: buildTests(dd),
    wrongPicks: buildWrongPicks(dd),
    coachingEvents: buildCoachingEvents(dd),
    mapTargets: buildMapTargets(dd),
    findings: buildFindings(dd),
    policyViolations: asArray<Record<string, unknown>>(
      dd?.brain_enrichment?.policy_violations
    ).map((p) => ({
      kind: asString(p.kind),
      description: asString(p.description) || asString(p.detail),
    })),
    recentPasses: buildRecentPasses(dd),
    flaggedSubjects: buildFlaggedSubjects(listRow, dd),
    liveActivityByDay: asRecord(dd?.live_activity?.by_day),
    lessonLogByDate: asRecord(dd?.lesson_log?.by_date),
    lessonLogTotalsByPlatform: asRecord(dd?.lesson_log?.totals?.by_platform),
    engagementOverall: (() => {
      const o = asRecord(dd?.engagement_diagnosis?.overall);
      if (Object.keys(o).length === 0) return undefined;
      return {
        status: asString(o.status),
        reason: asString(o.reason),
        severity: asString(o.severity),
        label: asString(o.label),
      };
    })(),
    engagementBySubject: (() => {
      const out: Record<string, { status?: string; reason?: string }> = {};
      const src = asRecord(dd?.engagement_diagnosis?.by_subject);
      for (const [k, v] of Object.entries(src)) {
        const r = asRecord(v);
        out[k] = {
          status: asString(r.status),
          reason: asString(r.reason),
        };
      }
      return out;
    })(),
    attentionReason:
      asString(dd?.attention_reason) ||
      asString((listRow || {}).attention_reason),
    coachingNeed: buildCoachingNeed(dd),
    actionPlanBuckets: {
      thisWeek: asArray(dd?.action_plan_buckets?.this_week),
      thisMonth: asArray(dd?.action_plan_buckets?.this_month),
      watch: asArray(dd?.action_plan_buckets?.watch),
    },
    escalations: asArray(dd?.escalations),
    brainEnrichment: {
      badTestWarnings: asArray(dd?.brain_enrichment?.bad_test_warnings),
      subjectDriLookup: dd?.brain_enrichment?.subject_dri_lookup,
      platformDriLookup: dd?.brain_enrichment?.platform_dri_lookup,
    },
    dataGeneratedAt: generatedAt,
  };

  return { status: "ok", profile };
}

/**
 * One-sentence current concern, derived from the strongest available signal.
 *
 * Order of preference: doom loop → repeat fails → engagement reason →
 * coaching overdue → flagged subjects → fallback.
 */
export function currentConcern(profile: StudentProfile): string {
  const doomTests = profile.tests.filter((t) => t.doomLoop);
  if (doomTests.length > 0) {
    const t = doomTests[0];
    const subj = t.subject || t.label || "a subject";
    return `Doom loop on ${subj} — ${doomTests.length} test${
      doomTests.length === 1 ? "" : "s"
    } stuck on repeat fail.`;
  }

  const fails = profile.tests.filter((t) => t.passed === false);
  if (fails.length >= 2) {
    const subj = fails[0].subject || fails[0].label || "a recent test";
    return `Failed ${subj} ${fails.length} times in the last cycle without a clean recovery.`;
  }

  if (profile.attentionReason && profile.attentionReason.trim()) {
    return profile.attentionReason.trim();
  }

  if (profile.engagementOverall?.reason) {
    return profile.engagementOverall.reason;
  }

  if (profile.coachingNeed?.overdue) {
    const d = profile.coachingNeed.lastCoachedDaysAgo;
    return `Coaching cadence has slipped${
      typeof d === "number" ? ` — last coached ${d} days ago.` : "."
    }`;
  }

  if (profile.flaggedSubjects.length > 0) {
    const list = profile.flaggedSubjects
      .slice(0, 2)
      .map((f) => f.subject)
      .join(" + ");
    return `Flagged in ${list} this week.`;
  }

  return "No primary concern this week — student appears on track.";
}

/**
 * One-sentence "what to do next" recommendation.
 *
 * Always action-shaped (verb-first). Falls through to acknowledge when the
 * student looks fine.
 */
export function recommendedAction(profile: StudentProfile): string {
  const doomTests = profile.tests.filter((t) => t.doomLoop);
  if (doomTests.length > 0) {
    const subj = doomTests[0].subject || doomTests[0].label || "the doom-loop subject";
    return `Run a 15-min guide session on ${subj}, then recheck after the next XP block.`;
  }

  const fails = profile.tests.filter((t) => t.passed === false);
  if (fails.length >= 2) {
    return "Review the wrong-answer pattern with the student before scheduling a retest.";
  }

  if (profile.coachingNeed?.post) {
    return "Run a post-test coaching session this week.";
  }
  if (profile.coachingNeed?.pre) {
    return "Schedule pre-test coaching before the next assignment.";
  }
  if (profile.coachingNeed?.overdue) {
    return "Schedule a check-in — coaching cadence has slipped.";
  }

  if (profile.flaggedSubjects.length > 0) {
    const subj = profile.flaggedSubjects[0].subject;
    return `Quick check on ${subj} accuracy this week.`;
  }

  return "Acknowledge and keep monitoring.";
}

/**
 * Vertical evidence timeline for the last `days` days.
 *
 * Mixes events from tests, recent passes, coaching, lesson_log activity
 * dropouts, and AI synthesis stamps. Always sorted newest-first.
 */
export function evidenceTimeline(
  profile: StudentProfile,
  days = 30
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  for (const t of profile.tests) {
    if (!t.timestamp) continue;
    const when = new Date(t.timestamp).getTime();
    if (Number.isNaN(when) || when < cutoff) continue;
    const label = t.label || t.slug || "test";
    const score =
      typeof t.score === "number" ? `${Math.round(t.score)}%` : "";
    const verb = t.passed === true ? "Passed" : t.passed === false ? "Failed" : "Took";
    out.push({
      date: t.timestamp,
      source: "AlphaTest",
      summary: `${verb} ${label}${score ? ` at ${score}` : ""}.`,
    });
  }

  for (const p of profile.recentPasses) {
    if (!p.date) continue;
    const when = new Date(p.date).getTime();
    if (Number.isNaN(when) || when < cutoff) continue;
    const score = typeof p.score === "number" ? ` at ${Math.round(p.score)}%` : "";
    out.push({
      date: p.date,
      source: "AlphaTest",
      summary: `Passed ${p.test || "a test"}${score}${
        p.escapedDoomLoop ? " — escaped a doom loop." : "."
      }`,
    });
  }

  for (const c of profile.coachingEvents) {
    if (!c.date) continue;
    const when = new Date(c.date).getTime();
    if (Number.isNaN(when) || when < cutoff) continue;
    const subj = c.subject ? ` (${c.subject})` : "";
    out.push({
      date: c.date,
      source: "Coaching",
      summary: `Coaching session${subj}${
        c.aiSummary ? ` — ${c.aiSummary.slice(0, 140)}` : "."
      }`,
    });
  }

  // Lesson log: surface days where the student was active in zero of the
  // expected subjects (skipping signal). This is best-effort — we just
  // emit the date with a Timeback source label.
  for (const [date, raw] of Object.entries(profile.lessonLogByDate || {})) {
    const when = new Date(date).getTime();
    if (Number.isNaN(when) || when < cutoff) continue;
    const entry = asRecord(raw);
    const totalMinutes = asNumber(entry.total_minutes);
    if (typeof totalMinutes === "number" && totalMinutes === 0) {
      out.push({
        date,
        source: "Timeback",
        summary: "0 minutes logged — possible skip day.",
      });
    }
  }

  // AI synthesis stamp — single chip showing freshness if available.
  const aiAt = profile.subjectBreakdown
    .map((s) => s.aiReportFreshnessDays)
    .filter((d): d is number => typeof d === "number")
    .sort((a, b) => a - b)[0];
  if (typeof aiAt === "number") {
    const stamp = new Date(Date.now() - aiAt * 86400000).toISOString();
    out.push({
      date: stamp,
      source: "AI",
      summary: `AI subject report synthesized (~${aiAt} day${
        aiAt === 1 ? "" : "s"
      } ago).`,
    });
  }

  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

/**
 * Open flags with lifecycle state from the feedback overlay.
 *
 * Returns one entry per (flagged_subject × flag_label) pair, plus one
 * entry for any policy violation. Flags whose latest feedback state is
 * `resolved` / `incorrect` / `snoozed` are removed.
 */
export function openFlags(
  profile: StudentProfile,
  overlay: FeedbackOverlay
): OpenFlag[] {
  const out: OpenFlag[] = [];
  const studentId = profile.identity.slug;

  // Subject-level flags
  for (const fs of profile.flaggedSubjects) {
    for (const flag of fs.flags) {
      const flagId = `${fs.subject}::${flag}`;
      const lc = overlay.byKey.get(feedbackKey(studentId, flagId));
      if (lc && (lc.state === "resolved" || lc.state === "incorrect" || lc.state === "snoozed")) {
        continue;
      }
      out.push({
        flagId,
        label: translateFlag(flag),
        subject: fs.subject,
        severity: severityForFlag(flag),
        source: "AlphaTest",
        state: lc ? lc.state : "open",
        stateAt: lc?.latestAt,
        stateBy: lc?.latestBy,
        detail: fs.defaultStatus,
      });
    }
  }

  // Policy violations
  for (const pv of profile.policyViolations) {
    if (!pv.kind) continue;
    const flagId = `policy::${pv.kind}`;
    const lc = overlay.byKey.get(feedbackKey(studentId, flagId));
    if (lc && (lc.state === "resolved" || lc.state === "incorrect" || lc.state === "snoozed")) {
      continue;
    }
    out.push({
      flagId,
      label: `Policy: ${pv.kind}`,
      severity: "attention",
      source: "AI",
      state: lc ? lc.state : "open",
      stateAt: lc?.latestAt,
      stateBy: lc?.latestBy,
      detail: pv.description,
    });
  }

  // Doom-loop test flags
  for (const t of profile.tests.filter((x) => x.doomLoop)) {
    const flagId = `doom::${t.slug || t.label || "test"}`;
    const lc = overlay.byKey.get(feedbackKey(studentId, flagId));
    if (lc && (lc.state === "resolved" || lc.state === "incorrect" || lc.state === "snoozed")) {
      continue;
    }
    out.push({
      flagId,
      label: `Doom loop: ${t.label || t.slug || "test"}`,
      subject: t.subject,
      severity: "critical",
      source: "AlphaTest",
      state: lc ? lc.state : "open",
      stateAt: lc?.latestAt,
      stateBy: lc?.latestBy,
      detail: t.aiClassification || undefined,
    });
  }

  return out;
}

function severityForFlag(internal: string): "critical" | "attention" | "info" {
  const k = internal.toLowerCase();
  if (k.includes("doom") || k.includes("repeat_fail") || k.includes("escaped")) {
    return "critical";
  }
  if (k.includes("skip") || k.includes("low_accuracy") || k.includes("post_test")) {
    return "attention";
  }
  return "info";
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
  escaped_doom_loop: "Escaped doom loop",
};

function translateFlag(internal: string): string {
  const k = internal.toLowerCase().trim();
  return FLAG_LABELS[k] || internal.replace(/_/g, " ");
}

/**
 * Re-export of `lookupLifecycle` typed for callers that already have a
 * profile in hand. Mostly here so component code doesn't have to import
 * from two places.
 */
export function lifecycleForFlag(
  overlay: FeedbackOverlay,
  studentId: string,
  flagId: string
): FeedbackOverlayEntry | null {
  return overlay.byKey.get(feedbackKey(studentId, flagId)) ?? null;
}
