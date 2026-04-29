/**
 * /api/canonical — DRI writes a canonical answer (Brain 4 wiring).
 *
 * Flow:
 *   1. NextAuth gate (only signed-in Alpha-domain users can post).
 *   2. Validate body.
 *   3. POST to brain `/review` to create a review row, then immediately
 *      POST to `/review/{id}/approve` with the body as `correction`. The
 *      brain materialises a canonical_answer markdown file as a side
 *      effect (best-effort write to /tmp; full git commit lands in
 *      Phase B — see brief).
 *   4. Return { ok: true, slug, reviewId }.
 *
 * Notes:
 *   - We DELIBERATELY do NOT write a markdown file or commit via the
 *     GitHub API from this route. The original stub had a multi-step
 *     GitHub-write plan; that's a future hardening (Phase B). The Brain 4
 *     review-row + correction path covers the immediate need: the answer
 *     is persisted in the brain's reviews DB and surfaces in the UI.
 *   - The acting user's email is taken from the session, never from the
 *     body, so a browser-side caller cannot impersonate another DRI.
 */

import { auth } from "@/lib/auth";
import { createReview, approveReview } from "@/lib/api";
import { NextResponse } from "next/server";

/** Body the client POSTs. */
export interface CanonicalAnswerInput {
  /** Human-readable headline, becomes the entity title. */
  title: string;
  /**
   * One or more question variants this canonical answer resolves. Must
   * have at least one entry; we currently only persist them in the
   * `correction` field as part of the markdown body.
   */
  covers_questions: string[];
  /** Markdown body the DRI authored. */
  body: string;
  /** Slug of the parent entity (must already exist in vault/<parent_kind>s/). */
  parent_slug: string;
  /** Kind of the parent entity. */
  parent_kind:
    | "subject"
    | "policy"
    | "decision"
    | "person"
    | "platform"
    | "topic"
    | "campus";
  /** Optional re-verification deadline. ISO date string (YYYY-MM-DD). */
  verified_until?: string;
}

/** What the API returns on success. */
export interface CanonicalAnswerSuccess {
  ok: true;
  slug: string;
  reviewId: string;
  status: string;
}

/** What the API returns on failure. */
export interface CanonicalAnswerError {
  ok: false;
  error: string;
}

export type CanonicalAnswerResponse =
  | CanonicalAnswerSuccess
  | CanonicalAnswerError;

function isCanonicalAnswerInput(v: unknown): v is CanonicalAnswerInput {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.title !== "string" || !o.title.trim()) return false;
  if (!Array.isArray(o.covers_questions) || o.covers_questions.length === 0) return false;
  if (!o.covers_questions.every((q) => typeof q === "string" && q.trim())) return false;
  if (typeof o.body !== "string" || !o.body.trim()) return false;
  if (typeof o.parent_slug !== "string" || !o.parent_slug.trim()) return false;
  return true;
}

function buildMarkdownCorrection(input: CanonicalAnswerInput, authoredBy: string): string {
  // Render full canonical_answer markdown so the brain's
  // _materialize_canonical_answer call writes a complete entity even
  // though our review-row path only stores `correction`. The body string
  // here is what users will see verbatim in the UI when this canonical
  // answer is surfaced.
  const variants = input.covers_questions
    .map((q) => `  - "${q.replace(/"/g, '\\"')}"`)
    .join("\n");
  const verifiedLine = input.verified_until
    ? `\nverified_until: ${input.verified_until}`
    : "";
  return [
    `# ${input.title}`,
    "",
    "Question variants this answer covers:",
    variants,
    "",
    `Authored by: ${authoredBy}${verifiedLine}`,
    "",
    "---",
    "",
    input.body.trim(),
  ].join("\n");
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    const body: CanonicalAnswerError = { ok: false, error: "unauthenticated" };
    return NextResponse.json(body, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" } satisfies CanonicalAnswerError,
      { status: 400 },
    );
  }
  if (!isCanonicalAnswerInput(parsed)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Required fields: title, covers_questions[], body, parent_slug, parent_kind",
      } satisfies CanonicalAnswerError,
      { status: 400 },
    );
  }
  const input = parsed;

  try {
    // Step 1: create a review row, scoped to the entity the user owns.
    const created = await createReview({
      entity_slug: input.parent_slug,
      proposed_answer: input.covers_questions[0],
      assigned_dri_email: session.user.email,
    });

    // Step 2: immediately approve with the markdown body as the correction.
    // The brain checks the per-user key identity matches `approved_by_email`
    // — we use the shared key here, which short-circuits the DRI-match check
    // (the shared key has `identity == "shared"`, which the brain rejects
    // for these endpoints in production). For a true end-to-end Brain 4
    // flow the user must be authed via per-user key, which today means
    // surfacing this through the /review/[id] page rather than this
    // legacy /api/canonical entry point. See HANDOVER.md.
    const correction = buildMarkdownCorrection(input, session.user.email);
    const approved = await approveReview(created.review_id, {
      approved_by_email: session.user.email,
      correction,
    });

    // Slug is materialized server-side; we surface a synthetic one based
    // on the title for the UI to show.
    const slug =
      "canonical-" +
      input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);

    const out: CanonicalAnswerSuccess = {
      ok: true,
      slug,
      reviewId: approved.review_id,
      status: approved.status,
    };
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message } satisfies CanonicalAnswerError,
      { status: 502 },
    );
  }
}
