/**
 * SubjectBreakdown — per-subject card grid.
 *
 * Shows: MAP RIT, grade gap, app enrollment, course type (Base / Hole-filling),
 * XP remaining, accuracy + decreasing flag, daily minutes, skip flag,
 * repeat-fail flag, and the AI subject report quote.
 *
 * Server-rendered. No interactivity.
 */
import type { SubjectBreakdownItem } from "@/lib/dashboard/studentProfile";

interface SubjectBreakdownProps {
  items: SubjectBreakdownItem[];
}

export function SubjectBreakdown({ items }: SubjectBreakdownProps) {
  if (items.length === 0) {
    return (
      <section
        aria-label="Subject breakdown"
        className="rounded-lg border border-stone-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-ink">Subject breakdown</h2>
        <p className="mt-2 text-sm text-stone-500">
          No per-subject data has been synthesized yet.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Subject breakdown"
      className="rounded-lg border border-stone-200 bg-white p-5"
    >
      <h2 className="text-sm font-semibold text-ink">Subject breakdown</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((s) => (
          <SubjectCard key={s.subject} subject={s} />
        ))}
      </div>
    </section>
  );
}

function SubjectCard({ subject }: { subject: SubjectBreakdownItem }) {
  const tone = subjectTone(subject);
  return (
    <article
      className={`rounded-md border p-3 text-sm ${tone}`}
      aria-label={`${subject.subject} card`}
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold text-ink">{subject.subject}</h3>
        {subject.courseType ? (
          <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-stone-600">
            {subject.courseType}
          </span>
        ) : null}
        {subject.appEnrollment ? (
          <span className="text-[11px] text-stone-500">
            · {subject.appEnrollment}
          </span>
        ) : null}
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
        <Stat label="MAP RIT" value={fmtNum(subject.mapRit)} />
        <Stat label="Grade gap" value={fmtAny(subject.gradeGap)} />
        <Stat label="XP remaining" value={fmtNum(subject.xpRemaining)} />
        <Stat
          label="Accuracy"
          value={
            typeof subject.accuracy === "number"
              ? `${Math.round(subject.accuracy)}%`
              : "—"
          }
          tone={subject.accuracyDecreasing ? "warn" : undefined}
        />
        <Stat label="Daily mins" value={fmtNum(subject.dailyMinutes)} />
      </dl>

      {(subject.skipFlag || subject.repeatFailFlag || subject.accuracyDecreasing) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {subject.skipFlag ? <Pill kind="warn">Skipping</Pill> : null}
          {subject.repeatFailFlag ? <Pill kind="crit">Repeat fail</Pill> : null}
          {subject.accuracyDecreasing ? (
            <Pill kind="warn">Accuracy decreasing</Pill>
          ) : null}
        </div>
      ) : null}

      {subject.flags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {subject.flags.slice(0, 4).map((f) => (
            <span
              key={f}
              className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] text-stone-600"
            >
              {f}
            </span>
          ))}
        </div>
      ) : null}

      {subject.aiSubjectReport ? (
        <blockquote className="mt-3 border-l-2 border-stone-300 pl-2.5 text-[12px] italic text-stone-700">
          &ldquo;{subject.aiSubjectReport}&rdquo;
          {typeof subject.aiReportFreshnessDays === "number" ? (
            <div className="mt-1 not-italic text-[10px] uppercase tracking-wider text-stone-500">
              AI synthesis · {formatAge(subject.aiReportFreshnessDays)}
            </div>
          ) : null}
        </blockquote>
      ) : null}
    </article>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "crit";
}) {
  const cls =
    tone === "warn"
      ? "text-amber-800"
      : tone === "crit"
      ? "text-red-800"
      : "text-ink";
  return (
    <>
      <dt className="text-[10px] uppercase tracking-wider text-stone-500">
        {label}
      </dt>
      <dd className={`tabular-nums ${cls}`}>{value}</dd>
    </>
  );
}

function Pill({
  kind,
  children,
}: {
  kind: "warn" | "crit";
  children: React.ReactNode;
}) {
  const cls =
    kind === "crit"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function subjectTone(s: SubjectBreakdownItem): string {
  if (s.repeatFailFlag) return "border-red-200 bg-red-50/60";
  if (s.skipFlag || s.accuracyDecreasing) return "border-amber-200 bg-amber-50/60";
  return "border-stone-200 bg-stone-50/60";
}

function fmtNum(v: number | null | undefined): string {
  return typeof v === "number" ? Math.round(v).toString() : "—";
}

function fmtAny(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function formatAge(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
