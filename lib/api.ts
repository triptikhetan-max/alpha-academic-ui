/**
 * Server-side API client for the alpha-academic-api on Vercel.
 *
 * Every request from the UI gets proxied through here so the API key
 * stays on the server (never exposed to the browser).
 */

const API_URL = process.env.ALPHA_API_URL ?? "https://alpha-academic-api.vercel.app";
const API_KEY = process.env.ALPHA_API_KEY ?? "";

export type MatchedNode = {
  kind: string;
  name: string;
  title: string;
  excerpt: string;
  body: string;
  dri_name: string | null;
  dri_email: string | null;
  last_updated: string | null;
};

export type MatchedDocument = {
  filename: string;
  date: string;
  sender: string | null;
  drive_url: string | null;
  subject_tags: string[];
  has_content: boolean;
  content_excerpt: string | null;
};

export type AskResponse = {
  query: string;
  matched_nodes: MatchedNode[];
  matched_documents: MatchedDocument[];
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
