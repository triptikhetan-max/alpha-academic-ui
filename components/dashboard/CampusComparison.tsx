/**
 * CampusComparison — compact rollup of subject performance per campus.
 */
export interface CampusRollup {
  campus: string;
  studentsFlagged: number;
  critical: number;
  attention: number;
  oldestUnackDays?: number | null;
}

interface CampusComparisonProps {
  rows: CampusRollup[];
}

export function CampusComparison({ rows }: CampusComparisonProps) {
  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-6 text-center">
        <p className="text-sm text-stone-500">
          No campuses in your subject scope this cycle.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr className="text-left">
            <th className="font-medium text-stone-500 uppercase tracking-wider px-3 py-2">
              Campus
            </th>
            <th className="font-medium text-stone-500 uppercase tracking-wider px-3 py-2 text-right">
              Flagged
            </th>
            <th className="font-medium text-stone-500 uppercase tracking-wider px-3 py-2 text-right">
              Critical
            </th>
            <th className="font-medium text-stone-500 uppercase tracking-wider px-3 py-2 text-right">
              Attention
            </th>
            <th className="font-medium text-stone-500 uppercase tracking-wider px-3 py-2 text-right">
              Oldest unack.
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.campus} className="border-b border-stone-100 last:border-b-0">
              <td className="px-3 py-2 font-medium text-ink">{row.campus}</td>
              <td className="px-3 py-2 tabular-nums text-right text-stone-700">
                {row.studentsFlagged}
              </td>
              <td className="px-3 py-2 tabular-nums text-right">
                {row.critical > 0 ? (
                  <span className="text-red-800 font-semibold">{row.critical}</span>
                ) : (
                  <span className="text-stone-400">0</span>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums text-right">
                {row.attention > 0 ? (
                  <span className="text-amber-800">{row.attention}</span>
                ) : (
                  <span className="text-stone-400">0</span>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums text-right text-stone-700">
                {row.oldestUnackDays === null || row.oldestUnackDays === undefined
                  ? "—"
                  : `${row.oldestUnackDays}d`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
