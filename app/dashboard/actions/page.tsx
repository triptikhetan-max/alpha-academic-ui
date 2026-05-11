/**
 * /dashboard/actions — Campus DRI's escalation audit log.
 *
 * Server-rendered. Auth + scope enforced by the parent dashboard layout.
 *
 * Lists every escalation the caller has authored, oldest-first by default.
 * Each row shows kid → subject → raised at → raised to → current status →
 * latest note. Status is derived from later `note` events tagged
 * `escalation-status:<value>` written against the same (studentId, flagId).
 *
 * The Campus DRI updates status from a small dropdown on each row (client
 * island in `ActionLogRow`).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { scopeForEmail } from "@/lib/dri-scopes";
import { fetchSourceData, isPending } from "@/lib/dashboard/scopedData";
import {
  loadFeedbackOverlay,
  type FeedbackEvent,
} from "@/lib/dashboard/feedbackOverlay";
import {
  ActionLogRow,
  type ActionLogRowData,
  type EscalationStatus,
} from "@/components/dashboard/ActionLogRow";
import { resolveSubjectDri } from "@/lib/dashboard/escalation";

export const dynamic = "force-dynamic";

interface ActionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_FILTERS: Array<{
  value: "all" | EscalationStatus;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "off", label: "Off" },
];

const STATUS_NOTE_PREFIX = "escalation-status:";

const VALID_STATUSES: EscalationStatus[] = [
  "open",
  "acked_by_sd",
  "in_progress",
  "done",
  "off",
];

function parseStatusFromNote(note: string | undefined): EscalationStatus | null {
  if (!note) return null;
  if (!note.startsWith(STATUS_NOTE_PREFIX)) return null;
  const value = note.slice(STATUS_NOTE_PREFIX.length).trim() as EscalationStatus;
  return VALID_STATUSES.includes(value) ? value : null;
}

interface StudentLookupValue {
  name: string;
  slug: string;
}

function buildStudentLookup(
  data: Awaited<ReturnType<typeof fetchSourceData>>
): Map<string, StudentLookupValue> {
  const map = new Map<string, StudentLookupValue>();
  if (!data || isPending(data)) return map;

  const students = Array.isArray(data.students) ? data.students : [];
  for (const s of students) {
    const id = typeof s.id === "string" ? s.id : "";
    const slug =
      (typeof s.slug === "string" && s.slug) ||
      (typeof s.student_id === "string" && s.student_id) ||
      id;
    const name = typeof s.name === "string" ? s.name : id;
    if (id) map.set(id.toLowerCase(), { name, slug });
    if (typeof s.slug === "string") map.set(s.slug.toLowerCase(), { name, slug });
    if (typeof s.student_id === "string")
      map.set(s.student_id.toLowerCase(), { name, slug });
  }
  return map;
}

export default async function ActionsPage({
  searchParams,
}: ActionsPageProps) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const scope = scopeForEmail(email);
  if (!scope) redirect("/login");

  const sp = await searchParams;
  const filterRaw =
    typeof sp?.status === "string"
      ? sp.status
      : Array.isArray(sp?.status)
      ? sp.status[0]
      : undefined;
  const filter: "all" | EscalationStatus =
    filterRaw && (VALID_STATUSES as string[]).includes(filterRaw)
      ? (filterRaw as EscalationStatus)
      : "all";

  // Pull a wider window than the default 7d so the audit log doesn't drop
  // older escalations the Campus DRI is still tracking.
  const overlay = await loadFeedbackOverlay(scope, { days: 60 });
  const data = await fetchSourceData();
  const studentLookup = buildStudentLookup(data);

  const callerEmail = email.toLowerCase();

  // Build rows from the overlay: one row per escalation EVENT authored by
  // the caller. Status is the latest `escalation-status:*` note for the
  // same (studentId, flagId). Default status if no follow-up note → "open".
  const rows: ActionLogRowData[] = [];
  overlay.byKey.forEach((entry) => {
    for (const evt of entry.events) {
      if (evt.action !== "escalated") continue;
      if (evt.userEmail.toLowerCase() !== callerEmail) continue;

      const followups = entry.events.filter(
        (e: FeedbackEvent) =>
          e.createdAt > evt.createdAt &&
          e.action === "note" &&
          parseStatusFromNote(e.note) !== null
      );
      followups.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const latestStatusEvt = followups[0];
      const status: EscalationStatus =
        parseStatusFromNote(latestStatusEvt?.note) ?? "open";

      const subjectLabel = evt.subject || "(unspecified)";
      const resolved =
        resolveSubjectDri(subjectLabel, null) ?? {
          email: "—",
          name: "—",
        };

      const lookup =
        studentLookup.get(evt.studentId.toLowerCase()) ?? {
          name: evt.studentId,
          slug: evt.studentId,
        };

      const latestNote = latestStatusEvt?.note?.startsWith(STATUS_NOTE_PREFIX)
        ? `Status: ${status}`
        : entry.note;

      rows.push({
        eventId: evt.eventId,
        studentId: evt.studentId,
        studentSlug: lookup.slug,
        studentName: lookup.name,
        subject: subjectLabel,
        raisedAt: evt.createdAt,
        raisedToName: resolved.name,
        raisedToEmail: resolved.email,
        status,
        latestNote,
        flagId: evt.flagId,
      });
    }
  });

  // oldest-first per spec
  rows.sort((a, b) => (a.raisedAt < b.raisedAt ? -1 : 1));

  const filteredRows =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink">Action Log</h1>
          <p className="mt-0.5 text-sm text-stone-600">
            Every escalation you have raised. Update status as the Subject DRI responds.
          </p>
        </div>
        <Link
          href="/dashboard/triage"
          className="text-xs text-stone-500 hover:text-ink underline"
        >
          ← Back to Triage
        </Link>
      </header>

      <nav
        aria-label="Filter by status"
        className="mb-4 flex flex-wrap gap-2"
      >
        {STATUS_FILTERS.map((f) => {
          const isActive = filter === f.value;
          const href =
            f.value === "all"
              ? "/dashboard/actions"
              : `/dashboard/actions?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${
                isActive
                  ? "border-ink bg-ink text-white"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {!overlay.available ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Feedback store is not yet configured. Set <code>BLOB_READ_WRITE_TOKEN</code> to enable the audit log.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-md border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-600">
          No escalations match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                <th className="py-2 pl-4 pr-3 font-medium">Student</th>
                <th className="py-2 pr-3 font-medium">Subject</th>
                <th className="py-2 pr-3 font-medium">Raised</th>
                <th className="py-2 pr-3 font-medium">Raised to</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Latest note</th>
                <th className="py-2 pr-4 font-medium">Update</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <ActionLogRow key={row.eventId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

