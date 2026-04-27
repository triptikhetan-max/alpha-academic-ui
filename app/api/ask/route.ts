import { auth } from "@/lib/auth";
import { ask } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  try {
    const result = await ask(query);
    // Note: the upstream API logs the query against our shared API key. If we
    // want per-user analytics later, we should send a `reported_by: session.user.email`
    // header upstream (requires API change on alpha-academic-api side).
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
