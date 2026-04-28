/**
 * Per-user plugin API keys, stateless.
 *
 * Each key encodes the user's email under an HMAC signature. The brain API
 * verifies the signature with the same shared master secret. No database
 * needed; revocation is a comma-separated env var the brain checks.
 *
 * Format: aab_<base64url(email)>.<base64url(hmac-sha256(email))[:22]>
 *
 * Why this shape:
 *   - Recoverable email at the brain API → audit log of who's actually calling
 *   - No central registry needed → cold-start friendly on serverless
 *   - Revocable at the email level by setting REVOKED_EMAILS env var
 *   - Rotatable by changing PLUGIN_KEY_MASTER_SECRET (invalidates all keys)
 */
import crypto from "node:crypto";

const KEY_PREFIX = "aab_";

function getSecret(): string {
  const secret = process.env.PLUGIN_KEY_MASTER_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "PLUGIN_KEY_MASTER_SECRET env var missing or too short (need 32+ chars)",
    );
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice(s.length % 4 || 3);
  return Buffer.from(padded, "base64").toString();
}

/**
 * Issue a stable per-user API key. Calling this twice for the same email
 * returns the same key (deterministic from email + master secret). That's
 * intentional — re-requesting access from the UI just re-emails the key.
 */
export function issueKey(email: string): string {
  const lowered = email.trim().toLowerCase();
  if (!lowered.includes("@")) {
    throw new Error("Invalid email");
  }
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(lowered)
    .digest();
  return `${KEY_PREFIX}${b64url(lowered)}.${b64url(sig).slice(0, 22)}`;
}

/**
 * Decode a key back to its email + verify the HMAC signature. Returns the
 * lowercased email on success, null otherwise. Used by the brain API.
 */
export function verifyKey(key: string): string | null {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const body = key.slice(KEY_PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot < 0) return null;
  const emailB64 = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  let email: string;
  try {
    email = b64urlDecode(emailB64);
  } catch {
    return null;
  }
  if (!email.includes("@")) return null;
  const expected = b64url(
    crypto.createHmac("sha256", getSecret()).update(email).digest(),
  ).slice(0, 22);
  // constant-time compare
  if (sig.length !== expected.length) return null;
  let same = 0;
  for (let i = 0; i < sig.length; i++) {
    same |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return same === 0 ? email : null;
}
