/**
 * RepeatStudents — kids who keep showing up week-after-week.
 *
 * Two compute paths layered together (see `repeatStudents` in
 * `lib/dashboard/masterView.ts`):
 *
 *   1. Preferred — overlay event history: distinct ISO-week count >= 2.
 *   2. Fallback — current data: failed tests spanning >=14 days plus an
 *      `attention_reason` on the student record.
 *
 * Both paths feed the same UI shape so the section never shows "—" once
 * the dashboard has any signal at all.
 */
import type { RepeatStudent } from "@/lib/dashboard/masterView";

interface RepeatStudentsProps {
  students: RepeatStudent[];
}

function rowMeta(s: RepeatStudent): string {
  return [s.campus, s.level].filter(Boolean).join(" · ");
}

export function RepeatStudents({ students }: RepeatStudentsProps) {
  return (
    <section aria-label="Repeat students" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider text-stone-500 font-medium">
          Repeat students
        </h2>
        <p className="text-xs text-stone-500">2+ weeks running</p>
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-xs text-stone-500">
          No repeat students yet. Once a student appears in the queue across
          two or more weeks, they will surface here.
        </div>
      ) : (
        <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
          {students.map((s) => (
            <li
              key={s.studentId}
              className="px-3 py-2 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink truncate">
                    {s.studentName}
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {rowMeta(s) || "—"}
                  </span>
                </div>
                <p className="text-xs text-stone-700 mt-1 leading-relaxed">
                  {s.reason}
                </p>
              </div>
              <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-900 flex-shrink-0">
                {s.consecutiveWeeks}w
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
