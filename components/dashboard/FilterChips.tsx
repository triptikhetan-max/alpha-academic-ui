/**
 * FilterChips — visible filter row above the triage queue.
 *
 * Filter state lives in the URL query string (?campus=BTX&level=L1&state=open)
 * so each chip is just a `<Link>`. No client JavaScript needed for filtering;
 * the server re-renders the queue on every filter change.
 *
 * Layout: one row per filter dimension. Active value renders as a filled
 * chip; selecting "All" returns to the unfiltered URL for that dimension.
 */
import Link from "next/link";
import type { TriageFilters } from "@/lib/dashboard/triage";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterRowProps {
  label: string;
  paramKey: keyof TriageFilters;
  options: FilterOption[];
  current: string | undefined;
  buildHref: (key: keyof TriageFilters, value: string | undefined) => string;
}

function FilterRow({
  label,
  paramKey,
  options,
  current,
  buildHref,
}: FilterRowProps) {
  if (options.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium min-w-[64px]">
        {label}
      </span>
      <Link
        href={buildHref(paramKey, undefined)}
        className={chipClass(current === undefined || current === "")}
        scroll={false}
      >
        All
      </Link>
      {options.map((opt) => (
        <Link
          key={opt.value}
          href={buildHref(paramKey, opt.value)}
          className={chipClass(current === opt.value)}
          scroll={false}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}

function chipClass(active: boolean): string {
  const base =
    "inline-flex items-center px-2.5 py-1 rounded-full text-xs border transition";
  if (active) {
    return `${base} bg-ink text-white border-ink`;
  }
  return `${base} bg-white text-stone-700 border-stone-200 hover:border-stone-300`;
}

interface FilterChipsProps {
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  filters: TriageFilters;
  campuses: FilterOption[];
  levels: FilterOption[];
  subjects: FilterOption[];
  flagTypes: FilterOption[];
  states: FilterOption[];
}

function buildHrefFactory(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>
) {
  return (key: keyof TriageFilters, value: string | undefined): string => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string" && v) next[k] = v;
    }
    if (value === undefined || value === "") {
      delete next[key];
    } else {
      next[key] = value;
    }
    const qs = new URLSearchParams(next).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
}

export function FilterChips({
  basePath,
  searchParams,
  filters,
  campuses,
  levels,
  subjects,
  flagTypes,
  states,
}: FilterChipsProps) {
  const buildHref = buildHrefFactory(basePath, searchParams);
  return (
    <section
      aria-label="Triage filters"
      className="rounded-lg border border-stone-200 bg-white p-3 space-y-2"
    >
      <FilterRow
        label="Campus"
        paramKey="campus"
        options={campuses}
        current={filters.campus}
        buildHref={buildHref}
      />
      <FilterRow
        label="Level"
        paramKey="level"
        options={levels}
        current={filters.level}
        buildHref={buildHref}
      />
      <FilterRow
        label="Subject"
        paramKey="subject"
        options={subjects}
        current={filters.subject}
        buildHref={buildHref}
      />
      <FilterRow
        label="Flag"
        paramKey="flagType"
        options={flagTypes}
        current={filters.flagType}
        buildHref={buildHref}
      />
      <FilterRow
        label="State"
        paramKey="state"
        options={states}
        current={filters.state}
        buildHref={buildHref}
      />
    </section>
  );
}
