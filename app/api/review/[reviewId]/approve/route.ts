/**
 * POST /api/review/[reviewId]/approve
 *
 * Proxies a DRI's approval to the brain's /review/{id}/approve endpoint.
 * The signed-in user's session email is forced into `approved_by_email`
 * so the client cannot spoof another DRI's identity from the browser.
 */
import { auth } from "@/lib/auth";
import { approveReview } from "@/lib/api";
import { NextResponse } from "next/server";

interface ApproveBody {
  correction?: string;
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
  let body: ApproveBody = {};
  try {
    body = (await req.json()) as ApproveBody;
  } catch {
    // empty body is allowed for plain approval
  }
  try {
    const review = await approveReview(reviewId, {
      approved_by_email: session.user.email,
      correction: body.correction,
    });
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}
