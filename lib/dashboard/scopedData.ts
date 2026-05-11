/**
 * Server-side helper for fetching the dashboard data.json from
 * private Vercel Blob storage and filtering it to the caller's
 * DRI scope.
 *
 * Used by:
 *   - /api/dashboard-data (read endpoint)
 *   - /api/dashboard/feedback (scope verification before write)
 *
 * The Blob is PRIVATE. The token (`BLOB_READ_WRITE_TOKEN`) is
 * server-only and must never be returned to the browser.
 */
import { head } from "@vercel/blob";
import {
  type DriScope,
  isCampusInScope,
  isLevelInScope,
} from "@/lib/dri-scopes";

const BLOB_PATHNAME = "dashboard/data.json";

export interface DashboardData {
  campuses?: Array<{ id?: string; [k: string]: unknown }>;
  students?: Array<{
    id?: string;
    slug?: string;
    student_id?: string;
    campus_id?: string;
    campus?: string;
    level?: string;
    [k: string]: unknown;
  }>;
  student_dds?: Record<
    string,
    { id?: string; identity?: { campus?: string; level?: string }; [k: string]: unknown }
  >;
  [k: string]: unknown;
}

export interface PendingEnvelope {
  status: "data_pending";
  message: string;
}

export function isPending(
  data: DashboardData | PendingEnvelope
): data is PendingEnvelope {
  return (data as PendingEnvelope).status === "data_pending";
}

/**
 * Fetch the raw data envelope from the configured private Blob.
 * Returns a `data_pending` envelope when no source is configured yet
 * or the upstream fetch fails — never throws on the happy/empty path.
 */
export async function fetchSourceData(): Promise<
  DashboardData | PendingEnvelope
> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return {
      status: "data_pending",
      message:
        "BLOB_READ_WRITE_TOKEN is not configured. Set it on Vercel and run `npm run upload:data` to seed the dashboard data.",
    };
  }
  let blobUrl: string;
  try {
    const meta = await head(BLOB_PATHNAME, { token });
    blobUrl = meta.url;
  } catch (err: unknown) {
    return {
      status: "data_pending",
      message:
        err instanceof Error && err.message.includes("not found")
          ? "Dashboard data not yet uploaded. Run `npm run upload:data` from a machine with the freshly built data.json."
          : "Blob lookup failed.",
    };
  }
  const res = await fetch(blobUrl, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    return {
      status: "data_pending",
      message: `Upstream data fetch failed (${res.status}).`,
    };
  }
  return (await res.json()) as DashboardData;
}

/**
 * Drop campuses + students that are out of the caller's scope.
 * Master scopes (empty arrays for both campuses and levels) pass through unchanged.
 *
 * Done immutably — never mutates the upstream object.
 */
export function filterDataForScope(
  data: DashboardData,
  scope: DriScope
): DashboardData {
  const isMaster = scope.campuses.length === 0 && scope.levels.length === 0;
  if (isMaster) return data;

  const campuses = Array.isArray(data.campuses)
    ? data.campuses.filter((c) => {
        const id = typeof c.id === "string" ? c.id : "";
        return isCampusInScope(scope, id);
      })
    : data.campuses;

  const students = Array.isArray(data.students)
    ? data.students.filter((s) => {
        const campusId =
          (typeof s.campus_id === "string" && s.campus_id) ||
          (typeof s.campus === "string" && s.campus) ||
          "";
        const level = typeof s.level === "string" ? s.level : "";
        return (
          isCampusInScope(scope, campusId) &&
          (level === "" || isLevelInScope(scope, level))
        );
      })
    : data.students;

  return {
    ...data,
    ...(campuses !== undefined ? { campuses } : {}),
    ...(students !== undefined ? { students } : {}),
  };
}

/**
 * True when the given studentId belongs to the caller's scope.
 *
 * Looks up the student in the (already-fetched) data envelope and checks
 * campus + level. Accepts the student id as it appears in the dashboard
 * payload, including both the `students[].id` form and the
 * `student_dds[slug]` keyed form.
 *
 * NOTE: this is a student-level scope check. Flag-level verification
 * (i.e. the flag actually belongs to this student) is a TODO for a
 * later PR — the current data shape doesn't expose a clean flag index.
 */
export function isStudentInScope(
  data: DashboardData,
  scope: DriScope,
  studentId: string
): boolean {
  if (!studentId) return false;
  const isMaster = scope.campuses.length === 0 && scope.levels.length === 0;
  if (isMaster) return true;

  const needle = studentId.toLowerCase();

  // Try students[] first.
  const fromList = Array.isArray(data.students)
    ? data.students.find((s) => {
        const candidates = [
          s.id,
          s.slug,
          s.student_id,
        ].filter((v): v is string => typeof v === "string");
        return candidates.some((v) => v.toLowerCase() === needle);
      })
    : undefined;

  if (fromList) {
    const campusId =
      (typeof fromList.campus_id === "string" && fromList.campus_id) ||
      (typeof fromList.campus === "string" && fromList.campus) ||
      "";
    const level = typeof fromList.level === "string" ? fromList.level : "";
    return (
      isCampusInScope(scope, campusId) &&
      (level === "" || isLevelInScope(scope, level))
    );
  }

  // Try student_dds (keyed by slug).
  const dds = data.student_dds;
  if (dds && typeof dds === "object") {
    const dd =
      dds[studentId] ||
      Object.values(dds).find(
        (d) => typeof d?.id === "string" && d.id.toLowerCase() === needle
      );
    if (dd) {
      const identity = dd.identity || {};
      const campusId = typeof identity.campus === "string" ? identity.campus : "";
      const level = typeof identity.level === "string" ? identity.level : "";
      return (
        isCampusInScope(scope, campusId) &&
        (level === "" || isLevelInScope(scope, level))
      );
    }
  }

  return false;
}
