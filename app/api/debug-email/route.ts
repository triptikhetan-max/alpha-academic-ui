import { NextResponse } from "next/server";

// Temporary debug endpoint to verify Vercel runtime sees Gmail env vars.
// Returns booleans + lengths only — no secret values.
// Remove after diagnosing the email issue.
export async function GET() {
  const user = process.env.GMAIL_USER ?? "";
  const pass = process.env.GMAIL_APP_PASSWORD ?? "";
  return NextResponse.json({
    deploy_marker: "caabfd2-or-later",
    has_gmail_user: Boolean(user),
    gmail_user_length: user.length,
    has_gmail_app_password: Boolean(pass),
    gmail_app_password_length: pass.length,
    node_env: process.env.NODE_ENV ?? null,
    vercel_env: process.env.VERCEL_ENV ?? null,
    timestamp: new Date().toISOString(),
  });
}
