/**
 * /api/canonical — Phase 2 STUB endpoint.
 *
 * Final shape: POST creates a new `canonical_answer` entity in
 * `alpha-brain-v2/vault/canonical_answers/` (committed via the GitHub API
 * under the DRI's identity). Indexed on the next nightly `build_brain.py`
 * refresh. From that point on, queries matching any of `covers_questions`
 * resolve to this answer instead of going through FAQ lookup or live LLM
 * synthesis.
 *
 * Today: auth gate works (401s for unauthenticated users), POST returns 501
 * to signal "not yet implemented." The type definitions below are the
 * contract the implementation will fulfill — wiring it up tomorrow is just
 * filling in the marked TODO sections.
 *
 * What the real implementation needs to do (in order):
 *   1. auth() — already wired. Reject if no session.
 *   2. Parse + validate body against `CanonicalAnswerInput` (use Zod).
 *   3. Confirm the signed-in user IS the DRI of `parent_slug` (look up via
 *      lib/dri-scopes — only the entity owner can author its canonical
 *      answer). 403 if not.
 *   4. Compute `slug` = `canonical-${kebab-case(title)}`. Ensure unique in
 *      vault (append `-2`, `-3`, etc. if collision).
 *   5. Render the markdown:
 *        ---
 *        title, kind: canonical_answer, slug, covers_questions, parent_kind,
 *        parent_slug, authored_by: <session.user.email>, authored_at: <now>,
 *        status: active
 *        ---
 *        <body>
 *   6. Commit to alpha-brain-v2 main via GitHub API:
 *        - PUT /repos/alpha-schools/alpha-brain-v2/contents/vault/canonical_answers/<slug>.md
 *        - author = { name: session.user.name, email: session.user.email }
 *        - message = `feat(canonical): ${title} (by ${authored_by})`
 *      Token: GITHUB_VAULT_WRITE_TOKEN (PAT scoped to alpha-brain-v2 only).
 *   7. Return { ok: true, slug, commitSha } on success.
 *   8. Errors: validation → 400, not-DRI → 403, GitHub failure → 502.
 *
 * Schema reference: alpha-brain-v2/vault/canonical_answers/README.md.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/** Body the client POSTs. */
export interface CanonicalAnswerInput {
  /** Human-readable headline, becomes the entity title. */
  title: string;
  /**
   * One or more question variants this canonical answer resolves. Must have
   * at least one entry. Indexed by FTS5 on next refresh.
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
  /** SHA of the commit that landed the new entity in alpha-brain-v2. */
  commitSha: string;
}

/** What the API returns on failure. */
export interface CanonicalAnswerError {
  ok: false;
  error: string;
}

export type CanonicalAnswerResponse =
  | CanonicalAnswerSuccess
  | CanonicalAnswerError;

export async function POST(_req: Request): Promise<NextResponse> {
  // Step 1: auth gate — works today.
  const session = await auth();
  if (!session?.user?.email) {
    const body: CanonicalAnswerError = {
      ok: false,
      error: "unauthenticated",
    };
    return NextResponse.json(body, { status: 401 });
  }

  // TODO: parse + validate body (Zod schema for CanonicalAnswerInput)
  // TODO: confirm session.user.email is the DRI of parent_slug (lib/dri-scopes)
  // TODO: render markdown frontmatter + body
  // TODO: commit to alpha-brain-v2 vault/canonical_answers/ via GitHub API
  // TODO: return { ok: true, slug, commitSha }

  const stubBody: CanonicalAnswerError = {
    ok: false,
    error: "Phase 2 not yet implemented",
  };
  return NextResponse.json(stubBody, { status: 501 });
}
