/**
 * Subject DRI derivations — pure functions that build the subject-scoped
 * model the `/dashboard/subject` page renders.
 *
 *   - `subjectStudentRows()` — student cards filtered to the DRI's subject(s).
 *   - `skillStandardClusters()` — group students by shared CCSS standard or topic.
 *   - `testHealthCards()` — suspected-bad-test list with confidence label.
 *   - `campusRollups()` — per-campus subject performance rollup.
 *
 * No I/O, no React. Easy to unit-test.
 */
import type { DashboardData } from "@/lib/dashboard/scopedData";
import type { DriScope } from "@/lib/dri-scopes";
import { isSubjectInScope } from "@/lib/dri-scopes";
import type { TriageItem } from "@/lib/dashboard/triage";
import type { SubjectStudentRow } from "@/components/dashboard/SubjectStudentQueue";
import type { SkillCluster } from "@/components/dashboard/SkillStandardClusters";
import type { TestHealthCard } from "@/components/dashboard/TestHealthCards";
import type { CampusRollup } from "@/components/dashboard/CampusComparison";

interface RawStudent {
  id?: string;
  slug?: string;
  student_id?: string;
  name?: string;
  campus?: string;
  level?: string;
  flagged_subjects?: Array<{ subject?: string; flags?: string[] }>;
  bad_questions?: BadQuestion[];
  [k: string]: unknown;
}

interface BadQuestion {
  test_slug?: string;
  test_name?: string;
  fail_rate_pct?: number;
  n_attempts?: number;
  subject?: string;
  ai_classification?: string;
}

interface SubjectBreakdown {
  subject?: string;
  accuracy_pct?: number;
  recent_accuracy_pct?: number;
  weak_topics?: Array<{ topic?: string; accuracy_pct?: number }>;
  ai_subject_report?: { headline?: string; recommended_next_step?: string };
}

interface AlphatestPick {
  subject?: string;
  alignment?: { standards?: string[] };
}

interface TestPatternEntry {
  topic?: string;
  accuracy_pct?: number;
  n_attempts?: number;
  severity?: string;
}

interface StudentDD {
  id?: string;
  identity?: { campus?: string; level?: string; name?: string };
  subject_breakdown?: SubjectBreakdown[];
  alphatest_picks?: { by_test_slug?: Record<string, AlphatestPick[]> };
  test_patterns?: {
    by_subject?: Record<string, { weak_topics?: TestPatternEntry[] }>;
  };
  bad_questions?: BadQuestion[];
}

function getSlug(s: RawStudent): string {
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

function studentsInSubject(
  data: DashboardData,
  scope: DriScope,
  subject: string
): RawStudent[] {
  const students = (data.students || []) as RawStudent[];
  if (!isSubjectInScope(scope, subject)) return [];
  const lc = subject.toLowerCase();
  return students.filter((s) => {
    const flagged = s.flagged_subjects || [];
    if (flagged.some((f) => (f.subject || "").toLowerCase() === lc)) return true;
    const slug = getSlug(s);
    const dd = getDD(data, slug);
    const breakdown = dd?.subject_breakdown || [];
    return breakdown.some((b) => (b.subject || "").toLowerCase() === lc);
  });
}

export function subjectStudentRows(
  data: DashboardData,
  scope: DriScope,
  triageByStudent: Map<string, TriageItem>
): SubjectStudentRow[] {
  const subjects = scope.subjects ?? [];
  if (subjects.length === 0) return [];
  const rows: SubjectStudentRow[] = [];
  for (const subject of subjects) {
    const students = studentsInSubject(data, scope, subject);
    for (const s of students) {
      const slug = getSlug(s);
      if (!slug) continue;
      const triage = triageByStudent.get(slug);
      if (!triage) continue;
      const dd = getDD(data, slug);
      const breakdown = (dd?.subject_breakdown || []).find(
        (b) => (b.subject || "").toLowerCase() === subject.toLowerCase()
      );
      const headline =
        breakdown?.ai_subject_report?.headline ||
        breakdown?.ai_subject_report?.recommended_next_step;
      const acc = breakdown?.recent_accuracy_pct ?? breakdown?.accuracy_pct ?? null;
      const subjectSignal =
        headline ||
        (acc !== null
          ? `${subject}: ${acc}% recent accuracy.`
          : `${subject}: flagged this cycle.`);
      const weak = (breakdown?.weak_topics || [])
        .map((t) => t.topic)
        .filter((t): t is string => typeof t === "string")
        .slice(0, 3);
      rows.push({ triage, subject, subjectSignal, subjectEvidence: weak });
    }
  }
  return rows;
}

export function skillStandardClusters(
  data: DashboardData,
  scope: DriScope,
  triageByStudent: Map<string, TriageItem>
): SkillCluster[] {
  const subjects = scope.subjects ?? [];
  if (subjects.length === 0) return [];
  const buckets = new Map<
    string,
    {
      kind: "standard" | "topic";
      label: string;
      subject: string;
      students: Map<string, string>;
      campuses: Set<string>;
    }
  >();
  function add(
    kind: "standard" | "topic",
    label: string,
    subject: string,
    studentId: string,
    studentName: string,
    campus: string
  ) {
    const key = `${kind}:${subject}:${label}`.toLowerCase();
    let b = buckets.get(key);
    if (!b) {
      b = {
        kind,
        label,
        subject,
        students: new Map(),
        campuses: new Set(),
      };
      buckets.set(key, b);
    }
    b.students.set(studentId, studentName);
    if (campus) b.campuses.add(campus.toLowerCase());
  }
  for (const subject of subjects) {
    const students = studentsInSubject(data, scope, subject);
    for (const s of students) {
      const slug = getSlug(s);
      if (!slug) continue;
      const triage = triageByStudent.get(slug);
      const studentName = triage?.studentName || s.name || slug;
      const campus = (s.campus || triage?.campus || "").trim();
      const dd = getDD(data, slug);
      const byTestSlug = dd?.alphatest_picks?.by_test_slug || {};
      for (const picks of Object.values(byTestSlug)) {
        for (const p of picks || []) {
          if ((p.subject || "").toLowerCase() !== subject.toLowerCase()) continue;
          const stds = p.alignment?.standards || [];
          for (const std of stds) {
            if (typeof std === "string" && std.trim()) {
              add("standard", std.trim(), subject, slug, studentName, campus);
            }
          }
        }
      }
      const tp = dd?.test_patterns?.by_subject || {};
      const subjEntry = Object.entries(tp).find(
        ([k]) => k.toLowerCase() === subject.toLowerCase()
      );
      if (subjEntry) {
        for (const t of subjEntry[1].weak_topics || []) {
          if (typeof t.topic === "string" && t.topic.trim()) {
            add("topic", t.topic.trim(), subject, slug, studentName, campus);
          }
        }
      }
    }
  }
  const clusters: SkillCluster[] = [];
  buckets.forEach((b) => {
    if (b.students.size < 2) return;
    clusters.push({
      kind: b.kind,
      label: b.label,
      subject: b.subject,
      studentNames: Array.from(b.students.values()).sort(),
      campuses: Array.from(b.campuses),
    });
  });
  clusters.sort((a, b) => b.studentNames.length - a.studentNames.length);
  return clusters;
}

export function testHealthCards(
  data: DashboardData,
  scope: DriScope
): TestHealthCard[] {
  const subjects = scope.subjects ?? [];
  if (subjects.length === 0) return [];
  const agg = new Map<
    string,
    {
      label: string;
      subject?: string;
      attempts: number;
      failCount: number;
      failRateSum: number;
      failRateCount: number;
      classifications: Set<string>;
      knownBad: boolean;
    }
  >();
  function bump(q: BadQuestion) {
    const slug = q.test_slug || q.test_name;
    if (!slug) return;
    if (q.subject && !isSubjectInScope(scope, q.subject)) return;
    const existing =
      agg.get(slug) ?? {
        label: q.test_name || q.test_slug || slug,
        subject: q.subject,
        attempts: 0,
        failCount: 0,
        failRateSum: 0,
        failRateCount: 0,
        classifications: new Set<string>(),
        knownBad: false,
      };
    if (typeof q.n_attempts === "number") existing.attempts += q.n_attempts;
    if (typeof q.fail_rate_pct === "number") {
      existing.failRateSum += q.fail_rate_pct;
      existing.failRateCount += 1;
      if (typeof q.n_attempts === "number") {
        existing.failCount += Math.round((q.fail_rate_pct / 100) * q.n_attempts);
      }
    }
    if (typeof q.ai_classification === "string") {
      existing.classifications.add(q.ai_classification);
      if (/known_bad|bad_test/.test(q.ai_classification)) existing.knownBad = true;
    }
    agg.set(slug, existing);
  }
  const topLevel = (data as { bad_questions?: BadQuestion[] }).bad_questions;
  if (Array.isArray(topLevel)) for (const q of topLevel) bump(q);
  const students = (data.students || []) as RawStudent[];
  for (const s of students) {
    const slug = getSlug(s);
    const dd = getDD(data, slug);
    for (const q of s.bad_questions || []) bump(q);
    for (const q of dd?.bad_questions || []) bump(q);
  }
  const cards: TestHealthCard[] = [];
  agg.forEach((a) => {
    const failRatePct =
      a.failRateCount > 0
        ? Math.round(a.failRateSum / a.failRateCount)
        : a.attempts > 0
        ? Math.round((a.failCount / a.attempts) * 100)
        : undefined;
    cards.push({
      label: a.label,
      subject: a.subject,
      failCount: a.failCount,
      attempts: a.attempts,
      failRatePct,
      aiClassification:
        a.classifications.size > 0
          ? Array.from(a.classifications).join(", ")
          : undefined,
      knownBad: a.knownBad,
    });
  });
  cards.sort((a, b) => {
    const fr = (b.failRatePct ?? 0) - (a.failRatePct ?? 0);
    if (fr !== 0) return fr;
    return b.attempts - a.attempts;
  });
  return cards;
}

export function campusRollups(
  data: DashboardData,
  scope: DriScope,
  triageByStudent: Map<string, TriageItem>
): CampusRollup[] {
  const subjects = scope.subjects ?? [];
  if (subjects.length === 0) return [];
  const map = new Map<string, CampusRollup>();
  for (const subject of subjects) {
    const students = studentsInSubject(data, scope, subject);
    for (const s of students) {
      const slug = getSlug(s);
      const triage = triageByStudent.get(slug);
      const campus = s.campus || triage?.campus || "Unknown";
      const row = map.get(campus) ?? {
        campus,
        studentsFlagged: 0,
        critical: 0,
        attention: 0,
      };
      row.studentsFlagged += 1;
      if (triage?.urgency === "critical") row.critical += 1;
      else if (triage?.urgency === "attention") row.attention += 1;
      map.set(campus, row);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.critical - a.critical || b.studentsFlagged - a.studentsFlagged
  );
}
