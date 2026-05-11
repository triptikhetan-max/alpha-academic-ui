/**
 * Feedback overlay — server-side reader for the durable feedback event store.
 *
 * Writes happen in `/api/dashboard/feedback` (one private Blob per event).
 * This module lists events from Vercel Blob, parses them, and reduces them
 * to a small "latest state per (studentId, flagId)" map that the Triage view
 * uses to:
 *   - hide resolved / incorrect / snoozed flags from the default queue
 *   - render a "Acknowledged by X" / "In progress" badge on cards
 *   - feed the "Resolved this week" KPI count
 *
 * Privacy:
 *   - Never returns blob URLs or tokens to the browser.
 *   - The overlay is constructed entirely server-side.
 *   - Caller is expected to use the resulting Map only inside server
 *     components / route handlers and pass derived booleans to the client.
 */
import { list } from "@vercel/blob";
import type { DriScope } from "@/lib/dri-scopes";
import { isCampusInScope, isLevelInScope } from "@/lib/dri-scopes";

export type FeedbackAction =
  | "acknowledge"
  | "in_progress"
  | "resolved"
  | "incorrect"
  | "note"
  | "snoozed"
  | "escalated";

export type LifecycleState =
  | "open"
  | "acknowledged"
  | "in_progress"
  | "resolved"
  | "incorrect"
  | "snoozed"
  | "escalated";

export interface FeedbackEvent {
  eventId: string;
  createdAt: string;
  userEmail: string;
  action: FeedbackAction;
  studentId: string;
  flagId?: string;
  sectionId?: string;
  note?: string;
  campus?: string;
  subject?: string;
  userScopeSnapshot?: {
    dri?: string;
    role?: string;
    campuses?: string[];
    levels?: string[];
  };
}

export interface FeedbackOverlayEntry {
  state: LifecycleState;
  latestAt: string;
  latestBy: string;
  note?: string;
  /** All events for this (studentId,flagId) key, oldest → newest. */
  events: FeedbackEvent[];
}

export interface FeedbackOverlay {
  /** Map of `${studentId}::${flagId|sectionId|"_student"}` → latest entry. */
  byKey: Map<string, FeedbackOverlayEntry>;
  /** Number of distinct (studentId, flagId) keys whose latest action is `resolved` within the window. */
  resolvedThisWeek: number;
  /** Whether the underlying blob list call succeeded. False means we treat everything as "open". */
  available: boolean;
}

const FEEDBACK_PREFIX = "dashboard/feedback/";

/** Build the canonical map key for an event. */
export function feedbackKey(
  studentId: string,
  flagId?: string,
  sectionId?: string
): string {
  return `${studentId}::${flagId || sectionId || "_student"}`;
}

function actionToState(action: FeedbackAction): LifecycleState {
  switch (action) {
    case "acknowledge":
      return "acknowledged";
    case "in_progress":
    case "note":
      return "in_progress";
    case "resolved":
      return "resolved";
    case "incorrect":
      return "incorrect";
    case "snoozed":
      return "snoozed";
    case "escalated":
      return "escalated";
    default:
      return "open";
  }
}

/** YYYY-MM-DD strings for the last `days` UTC days, including today. */
function recentDateBuckets(days: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Module-level cache                                                 */
/* ------------------------------------------------------------------ */

interface CachedRawEvents {
  fetchedAt: number;
  events: FeedbackEvent[];
}

const CACHE_TTL_MS = 30_000;
let rawEventsCache: CachedRawEvents | null = null;

/**
 * Fetch raw feedback events from Vercel Blob for the last `days` window.
 * Cached in-memory for 30 seconds (TTL) to keep the dashboard responsive
 * without hammering Blob list/head on every page render.
 */
async function fetchRawEvents(days: number): Promise<FeedbackEvent[] | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;

  const now = Date.now();
  if (
    rawEventsCache &&
    now - rawEventsCache.fetchedAt < CACHE_TTL_MS
  ) {
    return rawEventsCache.events;
  }

  const buckets = recentDateBuckets(days);
  const allEvents: FeedbackEvent[] = [];

  for (const bucket of buckets) {
    try {
      const result = await list({
        prefix: `${FEEDBACK_PREFIX}${bucket}/`,
        token,
        limit: 1000,
      });
      for (const blob of result.blobs) {
        try {
          const res = await fetch(blob.url, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (!res.ok) continue;
          const evt = (await res.json()) as Partial<FeedbackEvent>;
          if (
            evt &&
            typeof evt.studentId === "string" &&
            typeof evt.action === "string" &&
            typeof evt.createdAt === "string" &&
            typeof evt.userEmail === "string"
          ) {
            allEvents.push(evt as FeedbackEvent);
          }
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  rawEventsCache = { fetchedAt: now, events: allEvents };
  return allEvents;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Load feedback events scoped to the caller's DRI scope and reduce them
 * into a latest-state-per-key overlay.
 *
 * Returns `{ available: false }` (and an empty map) when:
 *   - BLOB_READ_WRITE_TOKEN is not configured, or
 *   - the underlying list/fetch fails.
 *
 * The Triage view treats unavailable overlay as "everything is open".
 */
export async function loadFeedbackOverlay(
  scope: DriScope | null,
  options: { days?: number; sinceIso?: string } = {}
): Promise<FeedbackOverlay> {
  const days = options.days ?? 7;
  const empty: FeedbackOverlay = {
    byKey: new Map(),
    resolvedThisWeek: 0,
    available: false,
  };

  const allEvents = await fetchRawEvents(days);
  if (!allEvents) return empty;

  const sinceCutoff = options.sinceIso ?? null;
  const scopedEvents = allEvents.filter((evt) => {
    if (sinceCutoff && evt.createdAt < sinceCutoff) return false;
    if (!scope) return true;
    return eventInScope(evt, scope);
  });

  const byKey = new Map<string, FeedbackOverlayEntry>();
  const sorted = scopedEvents
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  for (const evt of sorted) {
    const key = feedbackKey(evt.studentId, evt.flagId, evt.sectionId);
    const existing = byKey.get(key);
    const events = existing ? [...existing.events, evt] : [evt];
    byKey.set(key, {
      state: actionToState(evt.action),
      latestAt: evt.createdAt,
      latestBy: evt.userEmail,
      note: evt.note,
      events,
    });
  }

  let resolvedCount = 0;
  byKey.forEach((entry) => {
    if (entry.state === "resolved") resolvedCount++;
  });

  return {
    byKey,
    resolvedThisWeek: resolvedCount,
    available: true,
  };
}

/** Look up the latest lifecycle state for a given student/flag pair. */
export function lookupLifecycle(
  overlay: FeedbackOverlay,
  studentId: string,
  flagId?: string,
  sectionId?: string
): FeedbackOverlayEntry | null {
  if (!overlay.available) return null;
  return overlay.byKey.get(feedbackKey(studentId, flagId, sectionId)) ?? null;
}

/**
 * Best-effort scope check for a feedback event.
 * Uses the recorded snapshot (campus/subject) when present. Falls back to
 * the event's `campus` field. Master scopes pass through unchanged.
 */
export function eventInScope(evt: FeedbackEvent, scope: DriScope): boolean {
  const isMaster = scope.campuses.length === 0 && scope.levels.length === 0;
  if (isMaster) return true;

  const campus =
    evt.campus ||
    (Array.isArray(evt.userScopeSnapshot?.campuses) &&
      evt.userScopeSnapshot?.campuses?.[0]) ||
    "";

  // If we have no campus info at all, fall back to the snapshot DRI slug.
  if (!campus && evt.userScopeSnapshot?.dri === scope.dri) return true;

  if (campus && !isCampusInScope(scope, campus)) return false;

  // Levels rarely live on the event itself; if a snapshot has levels and
  // they overlap the caller's scope, allow it.
  const eventLevels = evt.userScopeSnapshot?.levels ?? [];
  if (eventLevels.length === 0) return true;
  return eventLevels.some((lvl) => isLevelInScope(scope, lvl));
}

/**
 * Lifecycle resolver — single source of truth for "what state is this in?".
 * Returns "open" when the overlay is unavailable or has no events for the key.
 */
export function lifecycleStateFor(
  studentId: string,
  flagId: string | undefined,
  overlay: FeedbackOverlay,
  sectionId?: string
): LifecycleState {
  const entry = lookupLifecycle(overlay, studentId, flagId, sectionId);
  if (!entry) return "open";
  return entry.state;
}

/* ------------------------------------------------------------------ */
/* Triage queue overlay application                                    */
/* ------------------------------------------------------------------ */

export interface TriageItem {
  studentId: string;
  flagId?: string;
  sectionId?: string;
  /** Lower = more urgent. "Critical" maps to 0, "Attention" to 1. */
  urgencyRank?: number;
  /** Used for tie-breaks: oldest unacknowledged first. ISO date. */
  flaggedAt?: string;
  [k: string]: unknown;
}

export interface AppliedTriageItem<T extends TriageItem> {
  item: T;
  state: LifecycleState;
  latestAt?: string;
  latestBy?: string;
  note?: string;
}

export interface ApplyOverlayOptions {
  /** Show resolved/incorrect/snoozed when true. Default false. */
  showResolved?: boolean;
}

/**
 * Filter + sort triage items using the overlay.
 *
 *   - Hide resolved/incorrect/snoozed by default
 *   - Acknowledged + in-progress sort below truly-open items inside each tier
 *   - Within an urgency tier: oldest-unacknowledged-first
 */
export function applyOverlayToTriage<T extends TriageItem>(
  items: T[],
  overlay: FeedbackOverlay,
  options: ApplyOverlayOptions = {}
): AppliedTriageItem<T>[] {
  const showResolved = options.showResolved ?? false;
  const decorated: AppliedTriageItem<T>[] = items.map((item) => {
    const entry = lookupLifecycle(
      overlay,
      item.studentId,
      item.flagId,
      item.sectionId
    );
    if (!entry) {
      return { item, state: "open" as LifecycleState };
    }
    return {
      item,
      state: entry.state,
      latestAt: entry.latestAt,
      latestBy: entry.latestBy,
      note: entry.note,
    };
  });

  const filtered = showResolved
    ? decorated
    : decorated.filter(
        (d) =>
          d.state !== "resolved" &&
          d.state !== "incorrect" &&
          d.state !== "snoozed"
      );

  const sortRank: Record<LifecycleState, number> = {
    open: 0,
    acknowledged: 1,
    escalated: 2,
    in_progress: 3,
    snoozed: 4,
    resolved: 5,
    incorrect: 6,
  };

  return filtered.slice().sort((a, b) => {
    const ua = a.item.urgencyRank ?? 99;
    const ub = b.item.urgencyRank ?? 99;
    if (ua !== ub) return ua - ub;
    const sa = sortRank[a.state];
    const sb = sortRank[b.state];
    if (sa !== sb) return sa - sb;
    const fa = a.item.flaggedAt ?? "";
    const fb = b.item.flaggedAt ?? "";
    if (fa && fb) return fa < fb ? -1 : fa > fb ? 1 : 0;
    return 0;
  });
}

/**
 * Count of distinct (studentId, flagId) keys whose latest state is `resolved`
 * within the overlay window. Convenience wrapper around `overlay.resolvedThisWeek`.
 */
export function resolvedThisWeek(overlay: FeedbackOverlay): number {
  return overlay.resolvedThisWeek;
}

/**
 * Latest-per-(studentId, flagId) events as a flat sorted array, newest first.
 * Used by the GET endpoint to return the visible queue overlay to clients.
 */
export function flattenLatestEvents(overlay: FeedbackOverlay): FeedbackEvent[] {
  const latest: FeedbackEvent[] = [];
  overlay.byKey.forEach((entry) => {
    const last = entry.events[entry.events.length - 1];
    if (last) latest.push(last);
  });
  return latest.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
