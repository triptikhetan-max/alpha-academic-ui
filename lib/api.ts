/**
 * Server-side API client for the alpha-academic-api on Vercel.
 *
 * Every request from the UI gets proxied through here so the API key
 * stays on the server (never exposed to the browser).
 */
import Anthropic from "@anthropic-ai/sdk";

const API_URL = process.env.ALPHA_API_URL ?? "https://alpha-academic-api.vercel.app";
const API_KEY = process.env.ALPHA_API_KEY ?? "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";

export type MatchedNode = {
  kind: string;
  name: string;
  title: string;
  excerpt: string;
  body: string;
  dri_name: string | null;
  dri_email: string | null;
  last_updated: string | null;
  /** AI-generated 1-3 sentence summary; null if not yet summarized */
  summary: string | null;
};

export type MatchedDocument = {
  filename: string;
  date: string;
  sender: string | null;
  drive_url: string | null;
  subject_tags: string[];
  has_content: boolean;
  content_excerpt: string | null;
  /** AI-generated 1-3 sentence summary; null if not yet summarized */
  summary: string | null;
};

export type AskResponse = {
  query: string;
  matched_nodes: MatchedNode[];
  matched_documents: MatchedDocument[];
  /** AI-synthesized answer in markdown (added by /api/ask after retrieval) */
  answer?: string;
};

export async function ask(query: string): Promise<AskResponse> {
  if (!API_KEY) {
    throw new Error("ALPHA_API_KEY env var not set on the server");
  }
  const res = await fetch(`${API_URL}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Alpha-API-Key": API_KEY,
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const SYNTHESIS_SYSTEM_PROMPT = `You are the synthesis layer for the Alpha Academic Brain — an internal knowledge base for the Alpha Schools academics team. Your job is to take retrieved entities + supporting documents and write a focused, actionable answer to the user's question.

Rules:
- Answer ONLY using the retrieved sources below. If the sources don't contain the answer, say so honestly — do not invent or guess.
- Open with a 1-line direct answer or summary of the situation.
- Use markdown: short headings (##), bullet lists, emoji prefixes (📚 📄 ✅ ❌ ⚠️ 👤) for scannable sections.
- Surface the DRI (responsible person) prominently if present in the sources, with their email if available.
- For procedural questions (PTC calls, proctoring, escalation), give a checklist the reader can follow.
- For lookup questions (DRIs, policies, links), be terse — just the answer + the source.
- End with a "📚 Source docs" table listing the doc filenames + Drive links you drew from, if any have real Drive URLs.
- Keep it tight — the reader is a busy teacher or coach, not a casual reader. No filler.
- The body of every retrieved entity is verbatim source material — quote/cite it; don't paraphrase facts.`;

interface SynthesisInput {
  query: string;
  matched_nodes: MatchedNode[];
  matched_documents: MatchedDocument[];
}

/**
 * Take the brain's retrieval output + the user's query and synthesize a
 * coherent markdown answer using Claude. Returns null on any failure so the
 * caller can fall back to showing raw cards.
 */
export async function synthesize(input: SynthesisInput): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;
  if (!input.matched_nodes.length && !input.matched_documents.length) {
    return null;
  }

  const nodesText = input.matched_nodes
    .slice(0, 5)
    .map((n, i) => {
      const dri = n.dri_name
        ? ` (DRI: ${n.dri_name}${n.dri_email ? ` · ${n.dri_email}` : ""})`
        : "";
      const summary = n.summary ? `Summary: ${n.summary}\n` : "";
      const body = (n.body || n.excerpt || "").slice(0, 1500);
      return `### Source ${i + 1} — ${n.kind}: ${n.title}${dri}\n${summary}Body:\n${body}`;
    })
    .join("\n\n---\n\n");

  const docsText = input.matched_documents
    .filter((d) => d.has_content && d.content_excerpt)
    .slice(0, 3)
    .map((d, i) => {
      const link = d.drive_url ? ` (Drive: ${d.drive_url})` : "";
      const summary = d.summary ? `Summary: ${d.summary}\n` : "";
      return `### Doc ${i + 1} — ${d.filename}${link}\n${summary}Excerpt:\n${(d.content_excerpt || "").slice(0, 1200)}`;
    })
    .join("\n\n---\n\n");

  const userMessage = `User's question: ${input.query}

Retrieved sources:

${nodesText}

${docsText ? `Supporting documents:\n\n${docsText}` : ""}

Write the answer now using only what's above.`;

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1500,
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = resp.content[0];
    if (block && block.type === "text") {
      return block.text;
    }
    return null;
  } catch {
    // Synthesis failed — caller falls back to raw cards.
    return null;
  }
}

export type HealthResponse = {
  ok: boolean;
  loaded: boolean;
  generated_at: string | null;
  nodes: Record<string, number>;
  documents: number;
  storage: { backend: string; redis_configured: boolean };
};

export async function health(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

export async function logFeedback(payload: {
  message: string;
  reported_by: string;
  kind?: "correction" | "gap" | "new-fact";
  claude_said?: string;
  source?: string;
}) {
  if (!API_KEY) throw new Error("ALPHA_API_KEY env var not set");
  const res = await fetch(`${API_URL}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Alpha-API-Key": API_KEY,
    },
    body: JSON.stringify({ kind: "correction", ...payload }),
    cache: "no-store",
  });
  return res.ok;
}
