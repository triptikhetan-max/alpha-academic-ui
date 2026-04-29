/**
 * /review/[reviewId] — DRI approval page (Brain 4).
 *
 * Server component:
 *  • Authenticates via NextAuth session (redirects to /login if absent).
 *  • Fetches the review record from the brain via the shared API key.
 *  • Verifies the signed-in user IS the assigned DRI on this review;
 *    shows a clean 403-style screen if not.
 *  • Renders the proposed answer + the original entity context.
 *  • Hands off to the `<ReviewActions>` client component for the buttons.
 *
 * The DRI email guard is also enforced server-side by the brain's
 * /review/.../approve endpoint — this is a UX layer so the buttons don't
 * appear for the wrong person.
 */
import { auth } from "@/lib/auth";
import { fetchReview } from "@/lib/api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReviewActions } from "./ReviewActions";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ReviewPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }
  const { reviewId } = await params;

  let review;
  let loadError: string | null = null;
  try {
    review = await fetchReview(reviewId);
  } catch (e) {
    loadError = (e as Error).message;
  }

  if (loadError || !review) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-12">
        <Header />
        <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-sm text-red-900">
          <p className="font-medium">Couldn&apos;t load review.</p>
          <p className="mt-1 text-xs">
            <code>{loadError ?? "no review returned"}</code>
          </p>
          <p className="mt-3">
            <Link href="/" className="text-accent underline">
              ← back to ask
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const sessionEmail = session.user.email.toLowerCase();
  const driEmail = (review.assigned_dri_email ?? "").toLowerCase();
  const isAssignedDri = !!driEmail && sessionEmail === driEmail;
  const isTerminal =
    review.status === "approved" ||
    review.status === "rejected" ||
    review.status === "stale";

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <Header />

      {/* Header card */}
      <section className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink">
              Review proposed edit
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              Review id <code>{review.review_id}</code>
            </p>
            {review.entity_slug && (
              <p className="text-xs text-stone-500 mt-1">
                Entity slug <code>{review.entity_slug}</code>
              </p>
            )}
          </div>
          <ReviewStatusBadge status={review.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-stone-600">
          <div>
            <span className="block text-stone-400">Assigned DRI</span>
            <span className="font-medium text-ink">
              {review.assigned_dri_email ?? "(unassigned)"}
            </span>
          </div>
          <div>
            <span className="block text-stone-400">Last updated</span>
            <span className="font-medium text-ink">
              {fmtDate(review.updated_at)}
            </span>
          </div>
        </div>
      </section>

      {/* Permission gate */}
      {!isAssignedDri && (
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-sm text-amber-900">
          <p className="font-medium">
            You aren&apos;t the assigned DRI on this review.
          </p>
          <p className="text-xs mt-1">
            You&apos;re signed in as <code>{session.user.email}</code>. Only{" "}
            <code>{review.assigned_dri_email}</code> can approve, reject, or
            request a revision.
          </p>
          <p className="text-xs mt-2">
            If this is wrong, contact Tripti — the DRI assignment lives in
            the brain&apos;s entity metadata.
          </p>
        </section>
      )}

      {/* Proposed answer */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
          ✏️ Proposed change
        </h2>
        <div className="bg-white border border-stone-200 rounded-lg p-4 whitespace-pre-wrap text-sm text-stone-800">
          {review.proposed_answer ?? (
            <span className="text-stone-400 italic">(no proposal text)</span>
          )}
        </div>
      </section>

      {/* Source path */}
      {review.source_path && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
            📄 Source file
          </h2>
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 font-mono text-xs text-stone-700">
            {review.source_path}
          </div>
        </section>
      )}

      {/* If a previous transition recorded a correction or rejection reason */}
      {review.correction && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
            🗒 DRI note
          </h2>
          <div className="bg-white border border-stone-200 rounded-lg p-4 whitespace-pre-wrap text-sm text-stone-800">
            {review.correction}
          </div>
        </section>
      )}

      {/* Action panel — only DRI on a non-terminal review */}
      {isAssignedDri && !isTerminal && (
        <ReviewActions
          reviewId={review.review_id}
          proposedAnswer={review.proposed_answer ?? ""}
        />
      )}

      {isTerminal && (
        <section className="text-xs text-stone-500 text-center">
          This review is in a terminal state ({review.status}). No further
          actions are possible.
        </section>
      )}

      <section className="border-t border-stone-200 pt-4">
        <Link href="/" className="text-xs text-stone-500 hover:text-ink">
          ← back to ask
        </Link>
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center gap-2">
      <Link href="/" className="text-xl">
        🧠
      </Link>
      <Link href="/" className="font-semibold text-ink hover:underline">
        Alpha Academic
      </Link>
      <span className="text-xs text-stone-400">· DRI review</span>
    </header>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
