import { auth } from "@/lib/auth";
import { ask } from "@/lib/api";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * POST /api/ask
 *
 * Thin proxy to the brain's `/ask` endpoint. Synthesis used to live here as
 * a separate Anthropic SDK call; that moved server-side into the brain
 * (Brain 3, `api/synthesis.py`) so prompt + citation rules + abstention all
 * live in one place. We just pass `answer_mode: "both"` so the brain returns
 * both a synthesized `answer` and the raw cards.
 */
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
    const result = await ask(query, { answer_mode: "both" });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
