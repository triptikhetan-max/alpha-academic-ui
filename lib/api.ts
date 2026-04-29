/**
 * Server-side API client for the Alpha Brain (FastAPI on Vercel).
 *
 * Every request from the UI gets proxied through here so the API key
 * stays on the server (never exposed to the browser).
 *
 * Brain 3 note (2026-04-29): synthesis now happens server-side in the
 * brain (`api/synthesis.py`). The UI no longer makes a direct Anthropic
 * call — `/api/ask` just proxies to the brain and returns whatever
 * `data.answer` the brain hands back. This keeps the synthesis prompt,
 * citation enforcement, and abstention rules in one place.
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
  /** AI-generated 1-3 sentence summary; null if not yet summarized */
  summary: string | null;
  /** Brain 2 provenance fields — populated on every card */
  slug?: string;
  source_path?: string | null;
  source_url?: string | null;
  content_hash?: string | null;
  page_number?: number | null;
  source_tier?: "canonical" | "faq" | "exact" | "fts" | null;
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
  /** Brain 2 provenance fields */
  kind?: string | null;
  slug?: string | null;
  source_path?: string | null;
  source_url?: string | null;
  content_hash?: string | null;
  page_number?: number | null;
  last_updated?: string | null;
  source_tier?: "canonical" | "faq" | "exact" | "fts" | null;
};

/** Confidence label produced by the brain's heuristic. */
export type ConfidenceLabel = "high" | "medium" | "low";

/**
 * Brain 3 server-side answer object. Present on `/ask` responses when
 * `answer_mode != "cards"`. The text is markdown; the UI renders it via
 * `<SynthesizedAnswer>`.
 */
export type AnswerObject = {
  text: string;
  abstained: boolean;
  confidence_label: ConfidenceLabel;
  /** Source IDs (kind:slug) the LLM cited, AFTER fabrication rejection. */
  sources_used: string[];
  review_state: "approved" | "generated" | "needs_dri";
};

export type AskResponse = {
  query: string;
  /** Server-side synthesized answer; null when cards-only mode or synthesis failed */
  answer: AnswerObject | null;
  matched_nodes: MatchedNode[];
  matched_documents: MatchedDocument[];
  hint?: string;
};

export type AnswerMode = "cards" | "synthesis" | "both";

interface AskOptions {
  answer_mode?: AnswerMode;
  min_confidence?: ConfidenceLabel;
}

export async function ask(
  query: string,
  options: AskOptions = {},
): Promise<AskResponse> {
  if (!API_KEY) {
    throw new Error("ALPHA_API_KEY env var not set on the server");
  }
  const body: Record<string, unknown> = { query };
  if (options.answer_mode) body.answer_mode = options.answer_mode;
  if (options.min_confidence) body.min_confidence = options.min_confidence;

  const res = await fetch(`${API_URL}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Alpha-API-Key": API_KEY,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  // Older brain deployments don't return `answer`; coerce to null so the
  // type stays strict on the UI side.
  const data = (await res.json()) as Partial<AskResponse> & {
    matched_nodes: MatchedNode[];
    matched_documents: MatchedDocument[];
    query: string;
  };
  return {
    query: data.query,
    answer: data.answer ?? null,
    matched_nodes: data.matched_nodes ?? [],
    matched_documents: data.matched_documents ?? [],
    hint: data.hint,
  };
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

// --- Reviews (Brain 4) -----------------------------------------------------
//
// The brain's `/review` endpoints are per-user-key gated, so the UI proxies
// every call through these helpers. Each helper picks the right key (the
// shared ALPHA_API_KEY when the action doesn't need to be attributed to a
// specific human, OR the user's per-user key when one is provided — the
// approve/reject/revise flows pass `userApiKey` through).

export type ReviewRecord = {
  review_id: string;
  entity_slug: string | null;
  source_path: string | null;
  status: "pending" | "approved" | "needs_revision" | "rejected" | "stale";
  assigned_dri_email: string | null;
  proposed_answer: string | null;
  correction: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

function reviewsHeaders(userApiKey?: string): Record<string, string> {
  const key = userApiKey || API_KEY;
  if (!key) throw new Error("No API key available for /review call");
  return {
    "Content-Type": "application/json",
    "X-Alpha-API-Key": key,
  };
}

export async function fetchReview(
  reviewId: string,
  userApiKey?: string,
): Promise<ReviewRecord> {
  const res = await fetch(
    `${API_URL}/review/${encodeURIComponent(reviewId)}`,
    { headers: reviewsHeaders(userApiKey), cache: "no-store" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fetchReview ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function createReview(
  body: {
    entity_slug?: string;
    source_path?: string;
    proposed_answer?: string;
    assigned_dri_email?: string;
  },
  userApiKey?: string,
): Promise<ReviewRecord> {
  const res = await fetch(`${API_URL}/review`, {
    method: "POST",
    headers: reviewsHeaders(userApiKey),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createReview ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function approveReview(
  reviewId: string,
  body: { approved_by_email: string; correction?: string },
  userApiKey?: string,
): Promise<ReviewRecord> {
  const res = await fetch(
    `${API_URL}/review/${encodeURIComponent(reviewId)}/approve`,
    {
      method: "POST",
      headers: reviewsHeaders(userApiKey),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`approveReview ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function rejectReview(
  reviewId: string,
  body: { rejected_by_email: string; reason: string },
  userApiKey?: string,
): Promise<ReviewRecord> {
  const res = await fetch(
    `${API_URL}/review/${encodeURIComponent(reviewId)}/reject`,
    {
      method: "POST",
      headers: reviewsHeaders(userApiKey),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`rejectReview ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function requestRevision(
  reviewId: string,
  body: { by_email: string; what_to_change: string },
  userApiKey?: string,
): Promise<ReviewRecord> {
  const res = await fetch(
    `${API_URL}/review/${encodeURIComponent(reviewId)}/needs-revision`,
    {
      method: "POST",
      headers: reviewsHeaders(userApiKey),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`requestRevision ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
