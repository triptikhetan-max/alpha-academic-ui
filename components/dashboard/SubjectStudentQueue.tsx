/**
 * SubjectStudentQueue — student cards filtered to a Subject DRI's subject(s).
 * Server-rendered. Each card mirrors the Triage card visuals plus a subject-
 * specific signal sentence pulled from `dd.subject_breakdown`.
 */
import type { TriageItem } from "@/lib/dashboard/triage";
import { LifecycleBadge } from "./LifecycleBadge";
import { TriageActions } from "./TriageActions";

export interface SubjectStudentRow {
  triage: TriageItem;
  subject: string;
  subjectSignal: string;
  subjectEvidence: string[];
}

interface SubjectStudentQueueProps {
  rows: SubjectStudentRow[];
}

function urgencyClass(u: TriageItem["urgency"]): string {
  if (u === "critical") return "bg-red-100 text-red-900 border-red-200";
  if (u === "attention") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-emerald-100 text-emerald-900 border-emerald-200";
}

function urgencyLabel(u: TriageItem["urgency"]): string {
  if (u === "critical") return "Critical";
  if (u === "attention") return "Attention";
  return "On track";
}

export function SubjectStudentQueue({ rows }: SubjectStudentQueueProps) {
  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-6 text-center">
        <p className="text-sm font-medium text-ink mb-1">
          No subject-flagged students
        </p>
        <p className="text-xs text-stone-500">
          Nothing in your subject scope is flagged this cycle.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-2" aria-label="Subject-flagged student queue">
      {rows.map(({ triage, subject, subjectSignal, subjectEvidence }) => {
        const meta = [triage.campus, triage.level].filter(Boolean).join(" · ");
        return (
          <article
            key={`${triage.studentId}-${subject}`}
            className="rounded-lg border border-stone-200 bg-white p-4 space-y-2.5"
          >
            <header className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink truncate">
                  {triage.studentName}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5 truncate">
                  {meta} · {subject}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${urgencyClass(
                    triage.urgency
                  )}`}
                >
                  {urgencyLabel(triage.urgency)}
                </span>
                <LifecycleBadge
                  state={triage.lifecycleState}
                  latestAt={triage.lifecycleAt}
                  latestBy={triage.lifecycleBy}
                />
              </div>
            </header>
            <p className="text-sm text-stone-800 leading-relaxed">{subjectSignal}</p>
            {subjectEvidence.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {subjectEvidence.map((label, i) => (
                  <span
                    key={`${triage.studentId}-se-${i}`}
                    className="text-[11px] px-2 py-0.5 rounded-full border bg-stone-50 text-stone-700 border-stone-200"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
            <TriageActions
              studentId={triage.studentId}
              studentSlug={triage.studentSlug}
              campus={triage.campus}
              subject={subject}
              initialLifecycleState={triage.lifecycleState}
            />
          </article>
        );
      })}
    </section>
  );
}
