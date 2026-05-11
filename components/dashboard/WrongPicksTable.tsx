/**
 * WrongPicksTable — collapsible table of the top-12 wrong-answer picks
 * for this kid.
 *
 * Each row shows: prompt · correct · picked · CCSS standard chip(s).
 * Uses native <details> so it stays a server component (no JS required).
 */
import type { WrongPickEntry, TestEntry } from "@/lib/dashboard/studentProfile";

interface WrongPicksTableProps {
  picks: WrongPickEntry[];
  tests: TestEntry[];
  initiallyOpen?: boolean;
}

export function WrongPicksTable({
  picks,
  tests,
  initiallyOpen = false,
}: WrongPicksTableProps) {
  const hasData = picks.length > 0 || tests.length > 0;
  if (!hasData) return null;

  return (
    <details
      className="rounded-lg border border-stone-200 bg-white p-5 [&_summary]:cursor-pointer"
      {...(initiallyOpen ? { open: true } : {})}
    >
      <summary className="flex items-center justify-between text-sm font-semibold text-ink">
        <span>Tests &amp; wrong-answer patterns</span>
        <span className="text-[11px] font-normal text-stone-500">
          {tests.length} test{tests.length === 1 ? "" : "s"} ·{" "}
          {picks.length} top miss{picks.length === 1 ? "" : "es"}
        </span>
      </summary>

      {tests.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
            Recent tests
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {tests.slice(0, 10).map((t, i) => (
              <li
                key={`${t.slug || t.label || i}-${i}`}
                className="flex flex-wrap items-baseline gap-x-2 text-sm"
              >
                <span className="font-medium text-ink">
                  {t.label || t.slug || "Test"}
                </span>
                {t.subject ? (
                  <span className="text-[11px] text-stone-500">
                    · {t.subject}
                  </span>
                ) : null}
                {typeof t.score === "number" ? (
                  <span
                    className={`tabular-nums text-xs ${
                      t.passed === false
                        ? "text-red-800"
                        : t.passed === true
                        ? "text-emerald-800"
                        : "text-stone-700"
                    }`}
                  >
                    {Math.round(t.score)}%
                  </span>
                ) : null}
                {typeof t.attempts === "number" && t.attempts > 1 ? (
                  <span className="text-[11px] text-stone-500">
                    · {t.attempts} attempts
                  </span>
                ) : null}
                {t.doomLoop ? (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                    doom loop
                  </span>
                ) : null}
                {t.aiClassification ? (
                  <span className="ml-auto text-[11px] italic text-stone-600">
                    AI: {t.aiClassification}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {picks.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
            Top missed questions
          </h3>
          <table className="mt-2 w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-500">
                <th className="py-1.5 pr-2 font-medium">Prompt</th>
                <th className="py-1.5 px-2 font-medium">Correct</th>
                <th className="py-1.5 px-2 font-medium">Picked</th>
                <th className="py-1.5 pl-2 font-medium">Standard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {picks.map((p, i) => (
                <tr key={`${p.testSlug}-${i}`} className="align-top">
                  <td className="py-1.5 pr-2 text-ink">{truncate(p.prompt, 120)}</td>
                  <td className="py-1.5 px-2 text-emerald-800">
                    {truncate(p.correctText, 60)}
                  </td>
                  <td className="py-1.5 px-2 text-red-800">
                    {truncate(p.pickedText, 60)}
                  </td>
                  <td className="py-1.5 pl-2">
                    {p.standards.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.standards.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-800"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  );
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
