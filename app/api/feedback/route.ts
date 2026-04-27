import { auth } from "@/lib/auth";
import { logFeedback } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  let body: {
    message?: string;
    kind?: "correction" | "gap" | "new-fact";
    claude_said?: string;
    source?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const ok = await logFeedback({
    message: body.message,
    reported_by: session.user.email,
    kind: body.kind ?? "correction",
    claude_said: body.claude_said,
    source: body.source,
  });
  return NextResponse.json({ ok });
}
