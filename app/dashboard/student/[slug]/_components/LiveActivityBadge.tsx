/**
 * LiveActivityBadge — client island that fetches /api/dashboard/live-activity
 * on mount and renders a "🟢 Live · pulled Ns ago" or "🟠 Cached · last
 * refreshed <ts>" badge plus a 14-day per-subject XP table.
 *
 * Falls back to `cachedLiveActivity` (from data.json's `dd.live_activity`)
 * when the live endpoint returns 503 — that path keeps the dashboard usable
 * before the Cognito creds are wired up.
 */
"use client";

import { useEffect, useMemo, useState } from "react";

interface SubjectActivity {
  xp: number;
  minutes: number;
  questions: number;
  correct: number;
  apps: string[];
  by_app: Record<string, number>;
}

interface LiveActivityResult {
  pulled_at: string;
  days: string[];
  by_day: Record<string, Record<string, SubjectActivity>>;
  totals: Record<string, { xp: number; minutes: number; questions: number; correct: number }>;
}

interface SuccessPayload {
  ok: true;
  pulled_at: string;
  data: LiveActivityResult;
}

interface ErrorPayload {
  ok: false;
  error: string;
  reason?: string;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "live"; payload: SuccessPayload; ageSec: number }
  | { kind: "fallback"; reason: string }
  | { kind: "error"; reason: string };

/**
 * Cached envelope shape from data.json — same shape as the live endpoint
 * minus the totals (we'll compute them on the fly).
 */
interface CachedLiveActivity {
  pulled_at?: string;
  days_pulled?: string[];
  by_day?: Record<string, Record<string, SubjectActivity>>;
}

interface LiveActivityBadgeProps {
  studentSlug: string;
  cachedLiveActivity?: CachedLiveActivity | null;
  days?: number;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function totalsFromCached(
  cached: CachedLiveActivity | null | undefined
): Record<string, { xp: number; minutes: number; questions: number; correct: number }> {
  const totals: Record<string, { xp: number; minutes: number; questions: number; correct: number }> = {};
  const byDay = cached?.by_day ?? {};
  for (const day of Object.keys(byDay)) {
    const subjects = byDay[day] ?? {};
    for (const subj of Object.keys(subjects)) {
      const m = subjects[subj];
      const cur = totals[subj] ?? { xp: 0, minutes: 0, questions: 0, correct: 0 };
      totals[subj] = {
        xp: cur.xp + (m.xp ?? 0),
        minutes: cur.minutes + (m.minutes ?? 0),
        questions: cur.questions + (m.questions ?? 0),
        correct: cur.correct + (m.correct ?? 0),
      };
    }
  }
  return totals;
}

export function LiveActivityBadge({
  studentSlug,
  cachedLiveActivity,
  days = 14,
}: LiveActivityBadgeProps) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      try {
        const res = await fetch(
          `/api/dashboard/live-activity?student=${encodeURIComponent(studentSlug)}&days=${days}`,
          { credentials: "same-origin", cache: "no-store" }
        );
        const json = (await res.json()) as SuccessPayload | ErrorPayload;
        if (cancelled) return;
        if (res.ok && "ok" in json && json.ok) {
          const ageSec = Math.max(
            0,
            Math.floor((Date.now() - new Date(json.pulled_at).getTime()) / 1000)
          );
          setState({ kind: "live", payload: json, ageSec });
          return;
        }
        const reason =
          ("reason" in json && json.reason) ||
          ("error" in json && json.error) ||
          `http_${res.status}`;
        if (res.status === 503 || res.status === 422) {
          setState({ kind: "fallback", reason });
          return;
        }
        setState({ kind: "error", reason });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "fetch_failed";
        setState({ kind: "error", reason: msg });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [studentSlug, days]);

  // Rerender every 5s so the "Ns ago" stays honest.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const totals = useMemo(() => {
    if (state.kind === "live") return state.payload.data.totals;
    if (state.kind === "fallback") return totalsFromCached(cachedLiveActivity);
    return {};
  }, [state, cachedLiveActivity]);

  const liveAgeLabel = useMemo(() => {
    if (state.kind !== "live") return "";
    const sec = Math.max(
      0,
      Math.floor((Date.now() - new Date(state.payload.pulled_at).getTime()) / 1000)
    );
    return formatAge(sec);
    // tick included to keep React happy about rerenders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tick]);

  const cachedAgeLabel = useMemo(() => {
    const ts = cachedLiveActivity?.pulled_at;
    if (!ts) return null;
    const ms = new Date(ts).getTime();
    if (!Number.isFinite(ms)) return null;
    return formatAge(Math.max(0, Math.floor((Date.now() - ms) / 1000)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedLiveActivity, tick]);

  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        background: "#fff",
        marginTop: 16,
      }}
      aria-live="polite"
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          {days}-day activity
        </h2>
        <Badge state={state} liveAgeLabel={liveAgeLabel} cachedAgeLabel={cachedAgeLabel} />
      </header>
      <TotalsTable totals={totals} state={state} />
    </section>
  );
}

interface BadgeProps {
  state: FetchState;
  liveAgeLabel: string;
  cachedAgeLabel: string | null;
}

function Badge({ state, liveAgeLabel, cachedAgeLabel }: BadgeProps) {
  if (state.kind === "loading") {
    return <Pill color="#6b7280" bg="#f3f4f6" label="Loading…" />;
  }
  if (state.kind === "live") {
    return (
      <Pill
        color="#065f46"
        bg="#d1fae5"
        label={`🟢 Live · pulled ${liveAgeLabel}`}
      />
    );
  }
  if (state.kind === "fallback") {
    const suffix = cachedAgeLabel ? ` · last refreshed ${cachedAgeLabel}` : "";
    return (
      <Pill
        color="#92400e"
        bg="#fef3c7"
        label={`🟠 Cached${suffix}`}
        title={state.reason}
      />
    );
  }
  return (
    <Pill
      color="#7f1d1d"
      bg="#fee2e2"
      label="🔴 Live data unavailable"
      title={state.reason}
    />
  );
}

interface PillProps {
  color: string;
  bg: string;
  label: string;
  title?: string;
}

function Pill({ color, bg, label, title }: PillProps) {
  return (
    <span
      title={title}
      style={{
        color,
        background: bg,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

interface TotalsTableProps {
  totals: Record<string, { xp: number; minutes: number; questions: number; correct: number }>;
  state: FetchState;
}

function TotalsTable({ totals, state }: TotalsTableProps) {
  if (state.kind === "loading") {
    return <p style={{ marginTop: 12, color: "#6b7280" }}>Pulling fresh data…</p>;
  }
  const rows = Object.entries(totals).sort((a, b) => b[1].xp - a[1].xp);
  if (rows.length === 0) {
    return (
      <p style={{ marginTop: 12, color: "#6b7280" }}>
        No subject activity in the window.
      </p>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "#6b7280" }}>
          <th style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Subject</th>
          <th style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>XP</th>
          <th style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>Minutes</th>
          <th style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb", textAlign: "right" }}>Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([subj, m]) => {
          const acc = m.questions > 0 ? Math.round((m.correct / m.questions) * 100) : null;
          return (
            <tr key={subj}>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>{subj}</td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{m.xp}</td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{m.minutes}</td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>
                {acc !== null ? `${acc}%` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
