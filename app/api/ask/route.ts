import { auth } from "@/lib/auth";
import { ask, synthesize } from "@/lib/api";
import { NextResponse } from "next/server";

export const maxDuration = 60;

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
    // 1. Retrieve cards from the brain (keyword search, fast, no LLM).
    const result = await ask(query);

    // 2. Synthesize a coherent answer from the retrieved cards via Claude.
    //    Falls back to null if ANTHROPIC_API_KEY isn't configured or the
    //    call fails — the UI renders raw cards in that case.
    const answer = await synthesize({
      query,
      matched_nodes: result.matched_nodes,
      matched_documents: result.matched_documents,
    });

    return NextResponse.json({ ...result, answer: answer ?? undefined });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
