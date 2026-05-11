/**
 * /dashboard/student/[slug] — unified Campus DRI student profile.
 *
 * Single scrollable page with EVERY data point about one kid, organized by
 * the handoff hierarchy:
 *
 *   1. Student header (sticky)
 *   2. Sticky action bar (acknowledge / in-progress / log / resolve / incorrect)
 *   3. Current concern + Recommended action + Open flags  (above the fold)
 *   4. Evidence timeline                                   (below the fold)
 *   5. Subject breakdown
 *   6. Tests + wrong-answer patterns        (collapsed)
 *   7. Coaching history                     (collapsed)
 *   8. MAP / growth targets                 (collapsed, hidden if no data)
 *   9. Raw data                             (collapsed by default)
 *
 * Auth + scope are enforced server-side. Out-of-scope kids → 403 page.
 *
 * RSC by default. Only `StudentActionBar` is a client component.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { scopeForEmail } from "@/lib/dri-scopes";
import {
  fetchSourceData,
  isPending,
  type DashboardData,
} from "@/lib/dashboard/scopedData";
import { loadFeedbackOverlay } from "@/lib/dashboard/feedbackOverlay";
import {
  loadStudentProfile,
  currentConcern,
  recommendedAction,
  evidenceTimeline,
  openFlags,
  type StudentProfile,
} from "@/lib/dashboard/studentProfile";
import { StudentHeader } from "@/components/dashboard/StudentHeader";
import { StudentActionBar } from "@/components/dashboard/StudentActionBar";
import { CurrentConcern } from "@/components/dashboard/CurrentConcern";
import { EvidenceTimeline } from "@/components/dashboard/EvidenceTimeline";
import { SubjectBreakdown } from "@/components/dashboard/SubjectBreakdown";
import { WrongPicksTable } from "@/components/dashboard/WrongPicksTable";
import { CoachingHistory } from "@/components/dashboard/CoachingHistory";
import { MapTargets } from "@/components/dashboard/MapTargets";
import { LiveActivityBadge } from "./_components/LiveActivityBadge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function StudentProfilePage({ params }: PageProps) {
  const { slug } = await params;

  // ── 1. Auth gate ────────────────────────────────────────────────────
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const scope = scopeForEmail(email);
  if (!scope) redirect("/login");

  // ── 2. Data load ────────────────────────────────────────────────────
  const data = await fetchSourceData();
  if (isPending(data)) {
    return <DataPendingPage message={data.message} />;
  }

  // ── 3. Profile + scope verification ─────────────────────────────────
  const result = loadStudentProfile(data, scope, slug);
  if (result.status === "out_of_scope") {
    return <ForbiddenPage email={email} slug={slug} />;
  }
  if (result.status === "not_found" || !result.profile) {
    return <NotFoundPage slug={slug} scopeName={scope.name} />;
  }

  const profile = result.profile;

  // ── 4. Feedback overlay (lifecycle state per flag) ──────────────────
  const overlay = await loadFeedbackOverlay(scope, { days: 30 });

  const concern = currentConcern(profile);
  const action = recommendedAction(profile);
  const timeline = evidenceTimeline(profile, 30);
  const flags = openFlags(profile, overlay);

  const ownerLabel = `Owner: ${scope.name.split(" ")[0]}`;
  const headerState = headerStateFor(profile, flags);
  const cachedLiveActivity = extractCachedLiveActivity(data, slug);

  return (
    <main className="min-h-screen bg-stone-50">
      <StudentHeader
        identity={profile.identity}
        ownerLabel={ownerLabel}
        state={headerState}
        dataGeneratedAt={profile.dataGeneratedAt}
      />
      <StudentActionBar
        studentId={profile.identity.slug}
        sectionId="student-profile"
        campus={profile.identity.campus}
        sourceView="student_profile"
        dataVersion={profile.dataGeneratedAt}
      />

      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
        {/* Live activity — fetches /api/dashboard/live-activity client-side
            and falls back to the cached envelope from data.json. */}
        <LiveActivityBadge
          studentSlug={profile.identity.slug}
          cachedLiveActivity={cachedLiveActivity}
          days={14}
        />

        {/* Above the fold — items 1-3 from the handoff. */}
        <CurrentConcern
          concern={concern}
          recommendedAction={action}
          flags={flags}
        />

        {/* Below the fold — progressive disclosure. */}
        <EvidenceTimeline events={timeline} />
        <SubjectBreakdown items={profile.subjectBreakdown} />
        <WrongPicksTable picks={profile.wrongPicks} tests={profile.tests} />
        <CoachingHistory events={profile.coachingEvents} />
        <MapTargets map={profile.mapTargets} />

        {/* Identity / contact (collapsed) */}
        <ContactDetails profile={profile} />

        {/* Raw data — collapsed by default */}
        <RawDataPanel profile={profile} />
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Page-local sub-components — small enough to keep inline. Each is RSC.
// ──────────────────────────────────────────────────────────────────────

function ContactDetails({ profile }: { profile: StudentProfile }) {
  const id = profile.identity;
  const hasAny =
    id.email || id.phone || id.coach || id.guardians.length > 0;
  if (!hasAny) return null;

  return (
    <details className="rounded-lg border border-stone-200 bg-white p-5 [&_summary]:cursor-pointer">
      <summary className="text-sm font-semibold text-ink">
        Contact &amp; guardians
      </summary>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {id.email ? (
          <Row label="Email">
            <a href={`mailto:${id.email}`} className="text-blue-700 underline">
              {id.email}
            </a>
          </Row>
        ) : null}
        {id.phone ? (
          <Row label="Phone">
            <a href={`tel:${id.phone}`} className="text-blue-700 underline">
              {id.phone}
            </a>
          </Row>
        ) : null}
        {id.coach ? <Row label="Coach">{id.coach}</Row> : null}
      </dl>

      {id.guardians.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
            Guardians
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {id.guardians.map((g, i) => (
              <li key={`${g.email || g.name || i}`} className="text-sm">
                <span className="font-medium text-ink">{g.name || "—"}</span>
                {g.role ? (
                  <span className="ml-2 text-[11px] text-stone-500">
                    {g.role}
                  </span>
                ) : null}
                {g.email ? (
                  <a
                    href={`mailto:${g.email}`}
                    className="ml-2 text-blue-700 underline"
                  >
                    {g.email}
                  </a>
                ) : null}
                {g.phone ? (
                  <span className="ml-2 text-stone-600">{g.phone}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-stone-500">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function RawDataPanel({ profile }: { profile: StudentProfile }) {
  // Pretty-printed JSON of the entire denormalized profile. Heavy, but
  // it's the explicit "raw data" panel from the handoff and must be
  // collapsed by default (handled by `details` without the `open` attr).
  const json = JSON.stringify(profile, null, 2);
  return (
    <details className="rounded-lg border border-stone-200 bg-white p-5 [&_summary]:cursor-pointer">
      <summary className="text-sm font-semibold text-ink">Raw data</summary>
      <pre className="mt-3 max-h-[480px] overflow-auto rounded-md bg-stone-900 p-3 text-[11px] leading-snug text-stone-100">
        <code>{json}</code>
      </pre>
    </details>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Error / empty pages
// ──────────────────────────────────────────────────────────────────────

function ForbiddenPage({ email, slug }: { email: string; slug: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
      <div className="max-w-lg rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Out of scope</h1>
        <p className="mt-3 text-sm text-stone-700">
          You signed in as <code className="rounded bg-stone-100 px-1.5 py-0.5">{email}</code>,
          but the student <code className="rounded bg-stone-100 px-1.5 py-0.5">{slug}</code>{" "}
          is not part of your assigned campus or level scope.
        </p>
        <p className="mt-3 text-sm text-stone-600">
          If you believe this is a mistake, contact{" "}
          <a
            href="mailto:tripti.khetan@trilogy.com"
            className="text-blue-700 underline"
          >
            tripti.khetan@trilogy.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}

function NotFoundPage({ slug, scopeName }: { slug: string; scopeName: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
      <div className="max-w-lg rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Student not found</h1>
        <p className="mt-3 text-sm text-stone-700">
          No record matching <code className="rounded bg-stone-100 px-1.5 py-0.5">{slug}</code>{" "}
          is available in {scopeName}&apos;s scope yet. The data may not have
          been refreshed yet.
        </p>
      </div>
    </main>
  );
}

function DataPendingPage({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
      <div className="max-w-lg rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Data not ready</h1>
        <p className="mt-3 text-sm text-stone-700">{message}</p>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Cached live-activity extraction (fallback when /api live route is 503)
// ──────────────────────────────────────────────────────────────────────

interface CachedLiveActivityEnvelope {
  pulled_at?: string;
  days_pulled?: string[];
  by_day?: Record<
    string,
    Record<
      string,
      {
        xp: number;
        minutes: number;
        questions: number;
        correct: number;
        apps: string[];
        by_app: Record<string, number>;
      }
    >
  >;
}

function extractCachedLiveActivity(
  data: DashboardData,
  slug: string
): CachedLiveActivityEnvelope | null {
  const dds = data.student_dds;
  if (!dds || typeof dds !== "object") return null;
  const dds2 = dds as Record<string, unknown>;
  const dd =
    dds2[slug] ||
    Object.entries(dds2).find(
      ([k]) => k.toLowerCase() === slug.toLowerCase()
    )?.[1];
  if (!dd || typeof dd !== "object") return null;
  const live = (dd as { live_activity?: unknown }).live_activity;
  if (!live || typeof live !== "object") return null;
  return live as CachedLiveActivityEnvelope;
}

// ──────────────────────────────────────────────────────────────────────
// Header state derivation
// ──────────────────────────────────────────────────────────────────────

function headerStateFor(
  profile: StudentProfile,
  flags: ReturnType<typeof openFlags>
): "critical" | "attention" | "on_track" | "resolved" {
  if (flags.some((f) => f.severity === "critical" && f.state === "open")) {
    return "critical";
  }
  if (flags.length === 0 && profile.flaggedSubjects.length === 0) {
    return "on_track";
  }
  if (flags.every((f) => f.state === "resolved")) {
    return "resolved";
  }
  return "attention";
}
