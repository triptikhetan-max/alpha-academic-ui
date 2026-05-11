/**
 * MapTargets — collapsible MAP RIT trajectory + 2X growth target gap.
 *
 * Renders nothing when no MAP data is available so the page stays clean.
 */
import type { MapTargetData } from "@/lib/dashboard/studentProfile";

interface MapTargetsProps {
  map: MapTargetData;
}

export function MapTargets({ map }: MapTargetsProps) {
  if (!map.hasData || map.bySubject.length === 0) return null;

  return (
    <details className="rounded-lg border border-stone-200 bg-white p-5 [&_summary]:cursor-pointer">
      <summary className="flex items-center justify-between text-sm font-semibold text-ink">
        <span>MAP / growth targets</span>
        <span className="text-[11px] font-normal text-stone-500">
          {map.bySubject.length} subject{map.bySubject.length === 1 ? "" : "s"}
        </span>
      </summary>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-500">
              <th className="py-1.5 pr-2 text-left font-medium">Subject</th>
              <th className="py-1.5 px-2 text-right font-medium">RIT</th>
              <th className="py-1.5 px-2 text-right font-medium">Target (2X)</th>
              <th className="py-1.5 px-2 text-right font-medium">Gap</th>
              <th className="py-1.5 pl-2 text-left font-medium">Trajectory</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {map.bySubject.map((row) => (
              <tr key={row.subject}>
                <td className="py-1.5 pr-2 text-ink">{row.subject}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {row.rit ?? "—"}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-stone-600">
                  {row.target ?? "—"}
                </td>
                <td
                  className={`py-1.5 px-2 text-right tabular-nums ${
                    typeof row.growthGap === "number" && row.growthGap < 0
                      ? "text-red-800"
                      : "text-stone-700"
                  }`}
                >
                  {typeof row.growthGap === "number"
                    ? row.growthGap > 0
                      ? `+${row.growthGap}`
                      : row.growthGap
                    : "—"}
                </td>
                <td className="py-1.5 pl-2 text-stone-600">
                  {row.trajectory || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-stone-500">
        Source chip: <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-800">MAP</span>
      </p>
    </details>
  );
}
