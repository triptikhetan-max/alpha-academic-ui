/**
 * POST /api/review/[reviewId]/needs-revision
 *
 * Proxies a "send back for revision" action to the brain. `by_email` is
 * pinned to the session, not the request body.
 */
import { auth } from "@/lib/auth";
import { requestRevision } from "@/lib/api";
import { NextResponse } from "next/server";

interface RevisionBody {
  what_to_change?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reviewId: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { reviewId } = await params;
  let body: RevisionBody;
  try {
    body = (await req.json()) as RevisionBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.what_to_change?.trim()) {
    return NextResponse.json(
      { error: "what_to_change is required" },
      { status: 400 },
    );
  }
  try {
    const review = await requestRevision(reviewId, {
      by_email: session.user.email,
      what_to_change: body.what_to_change,
    });
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}
