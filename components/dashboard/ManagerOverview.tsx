/**
 * ManagerOverview — calm, high-level oversight panel for managers.
 *
 * Hard rules:
 *   - All Acknowledge / Resolve / Mark incorrect buttons are HIDDEN here.
 *     Server-side: this component never imports `TriageActions` and never
 *     renders any feedback-mutating UI.
 *   - Read-only badge is shown on every card so it's visually obvious.
 *
 * Sections:
 *   - Critical by campus
 *   - Critical by owner (DRI workload)
 *   - Oldest unacknowledged
 *   - Resolved this week
 *   - Repeat students (kids appearing 2+ weeks in a row)
 *   - Data Health summary
 */
import type { LifecycleState } from "@/lib/dashboard/feedbackOverlay";
import { LifecycleBadge } from "./LifecycleBadge";

export interface ManagerCampusRow {
  campus: string;
  critical: number;
  attention: number;
  studentsInScope: number;
}

export interface ManagerOwnerRow {
  ownerLabel: string;
  open: number;
  inProgress: number;
  resolvedThisWeek: number;
}

export interface ManagerOldestRow {
  studentName: string;
  campus?: string;
  ageDays: number;
  state: LifecycleState;
}

export interface ManagerRepeatRow {
  studentName: string;
  campus?: string;
  weekCount: number;
  /** Brief evidence sentence, optional. */
  reason?: string;
}

export interface ManagerDataHealth {
  source: string;
  status: "fresh" | "partial" | "stale" | "failed" | "unknown";
  notes?: string;
}

interface ManagerOverviewProps {
  resolvedThisWeek: number;
  campusRows: ManagerCampusRow[];
  ownerRows: ManagerOwnerRow[];
  oldestRows: ManagerOldestRow[];
  repeatRows: ManagerRepeatRow[];
  dataHealth: ManagerDataHealth[];
}

function ReadOnlyTag() {
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-stone-50 text-stone-600 border-stone-200">
      Read-only
    </span>
  );
}

function StatusDot({ status }: { status: ManagerDataHealth["status"] }) {
  const color =
    status === "fresh"
      ? "bg-emerald-500"
      : status === "partial"
      ? "bg-amber-500"
      : status === "stale"
      ? "bg-red-500"
      : status === "failed"
      ? "bg-red-700"
      : "bg-stone-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden />;
}

export function ManagerOverview({
  resolvedThisWeek,
  campusRows,
  ownerRows,
  oldestRows,
  repeatRows,
  dataHealth,
}: ManagerOverviewProps) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <KpiCard label="Resolved this week" value={String(resolvedThisWeek)} />
        <KpiCard
          label="Campuses"
          value={String(campusRows.length)}
          hint="in your view"
        />
        <KpiCard
          label="Owners"
          value={String(ownerRows.length)}
          hint="DRIs"
        />
        <KpiCard
          label="Oldest unack."
          value={
            oldestRows[0]?.ageDays !== undefined
              ? `${oldestRows[0].ageDays}d`
              : "—"
          }
        />
      </section>

      <section aria-label="Critical by campus" className="space-y-2">
        <SectionHeader title="Critical by campus" />
        <CampusTable rows={campusRows} />
      </section>

      <section aria-label="Critical by owner" className="space-y-2">
        <SectionHeader title="Critical by owner (DRI workload)" />
        <OwnerTable rows={ownerRows} />
      </section>

      <section aria-label="Oldest unacknowledged" className="space-y-2">
        <SectionHeader title="Oldest unacknowledged" />
        {oldestRows.length === 0 ? (
          <EmptyCard message="Nothing unacknowledged this cycle." />
        ) : (
          <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
            {oldestRows.slice(0, 10).map((row, i) => (
              <li
                key={`${row.studentName}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {row.studentName}
                  </p>
                  {row.campus ? (
                    <p className="text-[11px] text-stone-500">{row.campus}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-stone-700 tabular-nums">
                    {row.ageDays}d
                  </span>
                  <LifecycleBadge state={row.state} variant="compact" />
                  <ReadOnlyTag />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Repeat students" className="space-y-2">
        <SectionHeader title="Repeat students" />
        {repeatRows.length === 0 ? (
          <EmptyCard message="No students appeared in 2+ recent weeks." />
        ) : (
          <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
            {repeatRows.slice(0, 10).map((row, i) => (
              <li
                key={`${row.studentName}-${i}`}
                className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {row.studentName}
                  </p>
                  <p className="text-[11px] text-stone-500">
                    {row.campus ? `${row.campus} · ` : ""}
                    {row.weekCount} weeks in a row
                  </p>
                  {row.reason ? (
                    <p className="text-xs text-stone-600 mt-0.5">{row.reason}</p>
                  ) : null}
                </div>
                <ReadOnlyTag />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Data health" className="space-y-2">
        <SectionHeader title="Data Health" />
        <ul className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
          {dataHealth.map((dh) => (
            <li
              key={dh.source}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status={dh.status} />
                <span className="text-sm font-medium text-ink truncate">
                  {dh.source}
                </span>
              </div>
              <div className="text-xs text-stone-600 flex-shrink-0">
                {dh.status}
                {dh.notes ? ` · ${dh.notes}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
}

function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-stone-500">{hint}</div>
      ) : null}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs uppercase tracking-wider text-stone-500 font-medium">
        {title}
      </h2>
      <ReadOnlyTag />
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 text-center text-xs text-stone-500">
      {message}
    </div>
  );
}

function CampusTable({ rows }: { rows: ManagerCampusRow[] }) {
  if (rows.length === 0) {
    return <EmptyCard message="No campuses in your view." />;
  }
  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium text-stone-500 uppercase tracking-wider">
              Campus
            </th>
            <th className="px-3 py-2 font-medium text-stone-500 uppercase tracking-wider text-right">
              Students
            </th>
            <th className="px-3 py-2 font-medium text-stone-500 uppercase tracking-wider text-right">
              Critical
            </th>
            <th className="px-3 py-2 font-medium text-stone-500 uppercase tracking-wider text-right">
              Attention
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.campus} className="border-b border-stone-100 last:border-b-0">
              <td className="px-3 py-2 font-medium text-ink">{row.campus}</td>
              <td className="px-3 py-2 tabular-nums text-right text-stone-700">
                {row.studentsInScope}
              </td>
              <td className="px-3 py-2 tabular-nums text-right">
                {row.critical > 0 ? (
                  <span className="text-red-800 font-semibold">
                    {row.critical}
                  </span>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OwnerTable({ rows }: { rows: ManagerOwnerRow[] }) {
  if (rows.length === 0) {
    return <EmptyCard message="No owners detected." />;
  }
  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium text-stone-500 uppercase tracking-wider">
              Owner
            </th>
            <th className="px-3 py-2 font-medium text-stone-500 uppercase tracking-wider text-right">
              Open
            </th>
            <th className="px-3 py-2 font-medium text-stone-500 uppercase tracking-wider text-right">
              In progress
            </th>
            <th className="px-3 py-2 font-medium text-stone-500 uppercase tracking-wider text-right">
              Resolved
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.ownerLabel}
              className="border-b border-stone-100 last:border-b-0"
            >
              <td className="px-3 py-2 font-medium text-ink">{row.ownerLabel}</td>
              <td className="px-3 py-2 tabular-nums text-right text-stone-700">
                {row.open}
              </td>
              <td className="px-3 py-2 tabular-nums text-right text-blue-800">
                {row.inProgress}
              </td>
              <td className="px-3 py-2 tabular-nums text-right text-emerald-800">
                {row.resolvedThisWeek}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
