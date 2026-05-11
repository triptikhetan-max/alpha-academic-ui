/**
 * Live Timeback edubridge analytics fetcher.
 *
 * TypeScript port of the Python pattern used by Bruna's local pullers
 * (see `/Volumes/T7 Shield/Work/Alpha/timeback-improvements/backend/data_client.py`,
 * function `fetch_analytics_local_days`).
 *
 * Why this lives server-side:
 *   - The Cognito M2M client_credentials grant + secret must NEVER touch the
 *     browser. This module is imported only by Next.js route handlers.
 *   - The token is cached in a module-level Map for ~50 minutes (Cognito
 *     issues 1-hour tokens; we leave a 10-minute safety buffer).
 *
 * Why EST-aligned day windowing:
 *   - The Timeback analytics endpoint indexes activities by UTC day. A 7pm
 *     local-time session in Texas is recorded as the *next* UTC day.
 *   - Splitting the request into per-local-day windows of
 *     [D 00:00:00 America/New_York, D 23:59:59 America/New_York] and
 *     summing every UTC bucket the API returns puts every activity on its
 *     correct local day. This matches what students see in their dashboard.
 *
 * No new deps: uses native `fetch` and the standard `Intl.DateTimeFormat`
 * for timezone math (works on Node 22 / Edge runtime).
 */

const TIMEBACK_API_BASE = "https://api.alpha-1edtech.ai";
const COGNITO_TOKEN_URL =
  "https://alpha-auth-production-pool.auth.us-east-1.amazoncognito.com/oauth2/token";
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes (refresh before 1h expiry)
const FETCH_TIMEOUT_MS = 20_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// Module-level token cache. Process-local — survives across requests on a
// warm Lambda but is rebuilt on cold start. That is intentional: Cognito
// rate-limits the token endpoint, so we want to amortise across requests.
const tokenCache: Map<string, CachedToken> = new Map();

export class CognitoCredsMissingError extends Error {
  constructor() {
    super(
      "Cognito client credentials are not configured (set ALPHA_CLIENT_ID + ALPHA_CLIENT_SECRET)"
    );
    this.name = "CognitoCredsMissingError";
  }
}

export class TimebackUpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "TimebackUpstreamError";
  }
}

function getCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.ALPHA_CLIENT_ID;
  const clientSecret = process.env.ALPHA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new CognitoCredsMissingError();
  }
  return { clientId, clientSecret };
}

/**
 * Fetch (or reuse) a Cognito M2M access token for the configured client.
 * The cache key is the client id, so different deployments / clients don't
 * collide.
 */
export async function getCognitoToken(): Promise<string> {
  const { clientId, clientSecret } = getCreds();
  const cached = tokenCache.get(clientId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(COGNITO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new TimebackUpstreamError(
      `Cognito token exchange failed (${res.status})`,
      res.status
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new TimebackUpstreamError("Cognito token response missing access_token");
  }
  tokenCache.set(clientId, {
    accessToken: json.access_token,
    expiresAt: now + TOKEN_TTL_MS,
  });
  return json.access_token;
}

/* ────────────────────────────────────────────────────────────────────── */
/* EST/EDT-aware date arithmetic                                          */
/* ────────────────────────────────────────────────────────────────────── */

const EASTERN_TZ = "America/New_York";

/** Format a Date as YYYY-MM-DD in the Eastern timezone. */
function easternDateString(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA gives YYYY-MM-DD
}

/**
 * Get the UTC offset (in minutes) for a wall-clock instant in America/New_York.
 * Positive offset = west of UTC.
 *
 * This handles EST (UTC+5) vs EDT (UTC+4) correctly without bringing in a
 * timezone library, by formatting the Date in NY and reading back the parts.
 */
function easternUtcOffsetMinutes(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  // Construct the *intended* local wall clock in NY by treating the parts as
  // a UTC instant, then reading what NY thinks the time is for that instant.
  // The difference is the offset.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(guessUtc));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const nyHour = get("hour") % 24; // some locales give 24 for midnight
  const nyMinute = get("minute");
  const nySecond = get("second");
  const nyDay = get("day");
  const nyMonth = get("month");
  const nyYear = get("year");

  const nyAsUtc = Date.UTC(nyYear, nyMonth - 1, nyDay, nyHour, nyMinute, nySecond);
  // offsetMs = guessUtc - nyAsUtc; if NY is behind UTC, nyAsUtc < guessUtc → offset > 0
  return (guessUtc - nyAsUtc) / 60_000;
}

/**
 * Convert a wall-clock instant in America/New_York to a UTC Date.
 * Pseudocode equivalent of Python's `datetime(...).replace(tzinfo=ZoneInfo("America/New_York")).astimezone(UTC)`.
 */
function easternWallclockToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  const offsetMin = easternUtcOffsetMinutes(year, month, day, hour, minute, second);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) + offsetMin * 60_000;
  return new Date(utcMs);
}

function toIsoZ(d: Date): string {
  // Trim millis: API uses YYYY-MM-DDTHH:MM:SSZ
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Build the list of local YYYY-MM-DD strings for [today - days, today]
 * in America/New_York. Inclusive on both ends.
 */
export function easternDayRange(days: number, now: Date = new Date()): string[] {
  const todayStr = easternDateString(now);
  const [yStr, mStr, dStr] = todayStr.split("-");
  const startMs = easternWallclockToUtc(
    Number(yStr),
    Number(mStr),
    Number(dStr),
    0,
    0,
    0
  ).getTime();
  const out: string[] = [];
  for (let i = days; i >= 0; i--) {
    const dayMs = startMs - i * 24 * 60 * 60 * 1000;
    out.push(easternDateString(new Date(dayMs)));
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────── */
/* Analytics fetch                                                        */
/* ────────────────────────────────────────────────────────────────────── */

export interface SubjectActivity {
  xp: number;
  minutes: number;
  questions: number;
  correct: number;
  apps: string[];
  by_app: Record<string, number>;
}

export type DayActivity = Record<string, SubjectActivity>; // subject → metrics

interface FactsEnvelope {
  facts?: Record<string, Record<string, FactSubject>>;
}

interface FactSubject {
  activityMetrics?: {
    xpEarned?: number;
    correctQuestions?: number;
    totalQuestions?: number;
  };
  timeSpentMetrics?: {
    activeSeconds?: number;
  };
  apps?: string[];
}

function halfUp(x: number): number {
  return Math.floor(x + 0.5);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TimebackUpstreamError(`Timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Fetch one local day of analytics for `studentId`. Returns the per-subject
 * map for that day, or an empty object on any error (logged, never thrown).
 *
 * NOTE: the API's `studentId` parameter expects the OneRoster sourcedId.
 */
async function fetchOneDay(
  token: string,
  studentId: string,
  localDay: string
): Promise<DayActivity> {
  const [yStr, mStr, dStr] = localDay.split("-");
  const startUtc = easternWallclockToUtc(
    Number(yStr),
    Number(mStr),
    Number(dStr),
    0,
    0,
    0
  );
  const endUtc = easternWallclockToUtc(
    Number(yStr),
    Number(mStr),
    Number(dStr),
    23,
    59,
    59
  );
  const url = new URL(`${TIMEBACK_API_BASE}/edubridge/analytics/activity`);
  url.searchParams.set("studentId", studentId);
  url.searchParams.set("startDate", toIsoZ(startUtc));
  url.searchParams.set("endDate", toIsoZ(endUtc));

  const res = await withTimeout(
    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    }),
    FETCH_TIMEOUT_MS
  );
  if (!res.ok) {
    return {};
  }
  const text = await res.text();
  if (!text) return {};
  let parsed: FactsEnvelope;
  try {
    parsed = JSON.parse(text) as FactsEnvelope;
  } catch {
    return {};
  }

  const dayData: DayActivity = {};
  const facts = parsed.facts ?? {};
  for (const utcKey of Object.keys(facts)) {
    const subjects = facts[utcKey] ?? {};
    for (const subj of Object.keys(subjects)) {
      const sdata = subjects[subj] ?? {};
      const am = sdata.activityMetrics ?? {};
      const ts = sdata.timeSpentMetrics ?? {};
      const xpRaw = Number(am.xpEarned ?? 0);
      const correct = Number(am.correctQuestions ?? 0);
      const total = Number(am.totalQuestions ?? 0);
      const activeSecs = Number(ts.activeSeconds ?? 0);
      if (!xpRaw && !total && !activeSecs) continue;

      const xp = halfUp(xpRaw);
      const minutes = halfUp(activeSecs / 60);
      const apps = Array.isArray(sdata.apps) ? sdata.apps.filter((a): a is string => typeof a === "string") : [];
      const primaryApp = apps[0] ?? "Unknown";

      const existing: SubjectActivity = dayData[subj] ?? {
        xp: 0,
        minutes: 0,
        questions: 0,
        correct: 0,
        apps: [],
        by_app: {},
      };
      const mergedApps = [...existing.apps];
      for (const a of apps) {
        if (!mergedApps.includes(a)) mergedApps.push(a);
      }
      dayData[subj] = {
        xp: existing.xp + xp,
        minutes: existing.minutes + minutes,
        questions: existing.questions + total,
        correct: existing.correct + correct,
        apps: mergedApps,
        by_app: {
          ...existing.by_app,
          [primaryApp]: (existing.by_app[primaryApp] ?? 0) + xp,
        },
      };
    }
  }
  return dayData;
}

export interface AnalyticsTotalsBySubject {
  xp: number;
  minutes: number;
  questions: number;
  correct: number;
}

export interface LiveActivityResult {
  pulled_at: string;
  days: string[];
  by_day: Record<string, DayActivity>;
  totals: Record<string, AnalyticsTotalsBySubject>;
}

/**
 * Fetch the last N local-Eastern days of analytics for `studentId`, with
 * each day shaped per-subject.
 *
 * Per-day fetches are parallelised (`Promise.all`) — the API tolerates
 * ~15 concurrent requests on a single token, and we cap at `days` per call.
 */
export async function fetchLiveActivity(
  studentId: string,
  days: number
): Promise<LiveActivityResult> {
  const safeDays = Math.max(1, Math.min(days, 31));
  const token = await getCognitoToken();
  const dayList = easternDayRange(safeDays - 1);

  const dayResults = await Promise.all(
    dayList.map(async (day) => [day, await fetchOneDay(token, studentId, day)] as const)
  );

  const by_day: Record<string, DayActivity> = {};
  const totals: Record<string, AnalyticsTotalsBySubject> = {};
  for (const [day, dayData] of dayResults) {
    if (Object.keys(dayData).length === 0) continue;
    by_day[day] = dayData;
    for (const subj of Object.keys(dayData)) {
      const m = dayData[subj];
      const existing = totals[subj] ?? { xp: 0, minutes: 0, questions: 0, correct: 0 };
      totals[subj] = {
        xp: existing.xp + m.xp,
        minutes: existing.minutes + m.minutes,
        questions: existing.questions + m.questions,
        correct: existing.correct + m.correct,
      };
    }
  }

  return {
    pulled_at: new Date().toISOString(),
    days: dayList,
    by_day,
    totals,
  };
}
