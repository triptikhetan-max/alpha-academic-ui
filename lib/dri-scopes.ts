/**
 * DRI scope map — who sees what inside the Brain Dashboard.
 *
 * The map is the single source of truth for both the post-login
 * landing redirect and the server-side data filtering enforced
 * inside `app/api/dashboard-data/route.ts`.
 *
 * Empty `campuses` or `levels` arrays mean "no restriction" (master view).
 *
 * NOTE: lookup keys are lowercased emails. `scopeForEmail` lower-cases
 * the input before lookup so callers do not have to remember to.
 */

/**
 * Functional role for the dashboard. Drives role-aware landing & view shape
 * (e.g. guides see the mobile action queue, subject DRIs see subject view).
 *
 * NOTE: introduced in PR 3. Existing scope entries omit this field — callers
 * should treat `undefined` as "no formal role set yet" and apply heuristics
 * (see `roleForScope` below) rather than failing closed.
 */
export type DriRole =
  | "operator"
  | "campus_dri"
  | "subject_dri"
  | "guide"
  | "manager_readonly"
  | "admin";

export interface DriScope {
  /** Short slug used by render.js (window.DRI_MODE.dri). */
  dri: string;
  name: string;
  email: string;
  role: string;
  /**
   * Campus IDs this DRI is allowed to see. Empty array = all campuses (master).
   * Values must match the `id` field on `DATA.campuses[i]` from data.json.
   */
  campuses: string[];
  /**
   * Levels this DRI is allowed to see (e.g. "WL","LL","L1","L2","MS").
   * Empty array = all levels.
   */
  levels: string[];
  /** Post-login redirect path inside the dashboard. */
  landing: string;
  /** Optional manager / escalation email for digests. */
  manager_email?: string;
  /**
   * Functional role. Optional for now — added in PR 3 and not yet enforced
   * outside the Guide View. When undefined, callers should fall back to the
   * heuristic in `roleForScope` (e.g. `dri` slug starts with "guide-").
   */
  appRole?: DriRole;
  /**
   * Subjects this DRI owns.
   *
   * Used for ROUTING ESCALATIONS ONLY — Campus DRIs raise issues to a
   * Subject DRI based on this list. There is intentionally NO Subject DRI
   * dashboard view, so this field MUST NOT be used to filter what the
   * dashboard shows. Matched case-insensitively against subject labels.
   */
  subjects?: string[];
}

export const DRI_SCOPES: Record<string, DriScope> = {
  "tripti.khetan@trilogy.com": {
    dri: "tripti",
    name: "Tripti Khetan",
    email: "tripti.khetan@trilogy.com",
    role: "Master / Operator",
    appRole: "operator",
    campuses: [],
    levels: [],
    landing: "/dashboard",
  },
  "claudio.ibe@alpha.school": {
    dri: "claudio",
    name: "Claudio Ibe",
    email: "claudio.ibe@alpha.school",
    role: "BTX Campus DRI · WL/LL/L1",
    campuses: ["BTX"],
    levels: ["WL", "LL", "L1"],
    landing: "/dashboard/triage",
  },
  "anastasiia.klechenko@alpha.school": {
    dri: "ana",
    name: "Anastasiia Klechenko",
    email: "anastasiia.klechenko@alpha.school",
    role: "BTX Campus DRI · L2/MS",
    appRole: "campus_dri",
    campuses: ["BTX"],
    levels: ["L2", "MS"],
    landing: "/dashboard/triage",
  },
  "bruna.rodrigues@2hourlearning.com": {
    dri: "bruna",
    name: "Bruna Rodrigues",
    email: "bruna.rodrigues@2hourlearning.com",
    role: "Miami Campus DRI",
    appRole: "campus_dri",
    campuses: ["Miami"],
    levels: [],
    landing: "/dashboard/triage",
  },
  "soaham.sharma@alpha.school": {
    dri: "soaham",
    name: "Soaham Sharma",
    email: "soaham.sharma@alpha.school",
    role: "Nova Bastrop Campus DRI",
    appRole: "campus_dri",
    campuses: ["Nova Bastrop"],
    levels: [],
    landing: "/dashboard/triage",
  },
  "piriyanga.janakarajan@2hourlearning.com": {
    dri: "piri",
    name: "Piriyanga Janakarajan",
    email: "piriyanga.janakarajan@2hourlearning.com",
    role: "GT Campus DRI · Coaching Lead",
    appRole: "campus_dri",
    campuses: ["GT"],
    levels: [],
    landing: "/dashboard/triage",
  },
  // ── Example: Subject DRI ────────────────────────────────────────────
  // Uncomment + replace the email when adding a real Subject DRI.
  // "math.dri@2hourlearning.com": {
  //   dri: "math-dri",
  //   name: "TBD Math DRI",
  //   email: "math.dri@2hourlearning.com",
  //   role: "Math Subject DRI",
  //   appRole: "subject_dri",
  //   subjects: ["Math"],
  //   campuses: [],
  //   levels: [],
  //   landing: "/dashboard/subject",
  // },
  //
  // ── Example: Manager (read-only) ────────────────────────────────────
  // "manager@alpha.school": {
  //   dri: "manager",
  //   name: "TBD Manager",
  //   email: "manager@alpha.school",
  //   role: "Manager · Read-only",
  //   appRole: "manager_readonly",
  //   campuses: [],
  //   levels: [],
  //   landing: "/dashboard/manager",
  // },
};

/** Master DRI slug — used as the default when Tripti has no override yet. */
export const MASTER_DRI_SLUG = "tripti";

/**
 * Look up the DRI scope for a Google-authenticated email.
 * Returns `null` when the email has no scope entry — callers should
 * render a "no access" page in that case.
 */
export function scopeForEmail(
  email: string | null | undefined
): DriScope | null {
  if (!email) return null;
  return DRI_SCOPES[email.toLowerCase()] ?? null;
}

/**
 * True when a campus id is in scope for the given DRI.
 *
 * Compares case-insensitively because the upstream `data.json` uses both
 * lowercase slugs (`campuses[i].id = "btx"` / `"nova-bastrop"`) and display
 * casing (`students[i].campus = "BTX"` / `"Nova Bastrop"`). Normalizing both
 * sides removes the silent-empty-filter trap.
 */
export function isCampusInScope(scope: DriScope, campusId: string): boolean {
  if (scope.campuses.length === 0) return true;
  const needle = (campusId || "").toLowerCase().replace(/\s+/g, "-");
  return scope.campuses.some(
    (c) => c.toLowerCase().replace(/\s+/g, "-") === needle
  );
}

/** True when a level code is in scope for the given DRI. Case-insensitive. */
export function isLevelInScope(scope: DriScope, level: string): boolean {
  if (scope.levels.length === 0) return true;
  const needle = (level || "").toUpperCase();
  return scope.levels.some((l) => l.toUpperCase() === needle);
}

/**
 * Resolve the functional role for a scope.
 *
 * Order of precedence:
 *   1. Explicit `appRole` field on the scope (preferred — PR 3+).
 *   2. Heuristic: `dri` slug starts with "guide-" → "guide".
 *   3. Default: `"campus_dri"` (the most common case before roles were added).
 *
 * TODO(roles): once every DRI_SCOPES entry has an `appRole`, drop the
 * heuristic and make `appRole` required.
 */
export function roleForScope(scope: DriScope): DriRole {
  if (scope.appRole) return scope.appRole;
  if (scope.dri && scope.dri.toLowerCase().startsWith("guide-")) {
    return "guide";
  }
  return "campus_dri";
}

/**
 * True when the scope is a manager / read-only viewer.
 * Used by server components to suppress action buttons defensively
 * (button-state suppression, not just CSS).
 */
export function isReadOnly(scope: DriScope): boolean {
  return roleForScope(scope) === "manager_readonly";
}

/**
 * True when a subject is in scope for the given DRI. Master / non-subject
 * scopes always pass. Comparison is case-insensitive.
 */
export function isSubjectInScope(scope: DriScope, subject: string): boolean {
  const subjects = scope.subjects ?? [];
  if (subjects.length === 0) return true;
  const needle = (subject || "").toLowerCase();
  return subjects.some((s) => s.toLowerCase() === needle);
}

/**
 * Default landing path for a role. Used by `/dashboard` to redirect users
 * to the surface that matches their role.
 */
export function landingForRole(role: DriRole): string {
  switch (role) {
    case "operator":
    case "admin":
      return "/dashboard";
    case "campus_dri":
      return "/dashboard/triage";
    case "subject_dri":
      // Subject DRIs have no dashboard view of their own — they receive
      // escalations via email and respond out of band. Send them to the
      // operator/triage surface so they can still see Alpha-wide context.
      return "/dashboard";
    case "guide":
      return "/dashboard/guide";
    case "manager_readonly":
      return "/dashboard/manager";
    default:
      return "/dashboard";
  }
}
