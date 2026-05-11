/**
 * Shared response helpers for dashboard API routes.
 *
 * Every dashboard endpoint must return:
 *   Cache-Control: private, no-store
 *   Vary: Cookie, Authorization
 *
 * Student data is per-user and must never be cached on shared CDNs.
 */
import { NextResponse } from "next/server";

const PRIVATE_NO_STORE = "private, no-store";
const VARY_COOKIE_AUTH = "Cookie, Authorization";

export function dashboardHeaders(): HeadersInit {
  return {
    "Cache-Control": PRIVATE_NO_STORE,
    Vary: VARY_COOKIE_AUTH,
  };
}

export function dashboardJson<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: dashboardHeaders(),
  });
}
