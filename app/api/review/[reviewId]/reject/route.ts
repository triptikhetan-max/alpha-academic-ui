/**
 * POST /api/review/[reviewId]/reject
 *
 * Proxies a DRI's rejection to the brain's /review/{id}/reject endpoint.
 * `rejected_by_email` is taken from the NextAuth session, NOT the body, so
 * the client can't claim another identity.
 */
import { auth } from "@/lib/auth";
import { rejectReview } from "@/lib/api";
import { NextResponse } from "next/server";

interface RejectBody {
  reason?: string;
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
  let body: RejectBody;
  try {
    body = (await req.json()) as RejectBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.reason?.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  try {
    const review = await rejectReview(reviewId, {
      rejected_by_email: session.user.email,
      reason: body.reason,
    });
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}
