/**
 * /dashboard — unified comprehensive landing surface.
 *
 * Both Tripti (master/operator) AND Campus DRIs (Claudio, Ana, Bruna,
 * Soaham, Piri) see the SAME structure here — just filtered to their scope.
 * The campus + level rollup sections auto-hide when the caller's scope
 * spans <2 of that dimension, so a single-campus DRI doesn't see a 1-card
 * "rollup". Subject filter chips are an in-page drill-down via `?subject=…`.
 *
 * Routing rules:
 *   - Unauthenticated → /login (enforced by `app/dashboard/layout.tsx`)
 *   - No DRI scope → "no access" card (enforced by layout)
 *   - Guides → redirect to /dashboard/guide (their dedicated mobile queue)
 *   - Manager (read-only) → redirect to their landing
 *   - Everyone else (operator / admin / campus_dri / no role) → render
 *     `<UnifiedDashboard />` scope-filtered for them
 *
 * Server component. Filter state lives in the URL query string. Card buttons
 * are a small client island (`TriageActions`).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  roleForScope,
  scopeForEmail,
  type DriScope,
} from "@/lib/dri-scopes";
import { loadDashboardData } from "@/lib/dashboard/masterView";
import { UnifiedDashboard } from "@/components/dashboard/UnifiedDashboard";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const scope = scopeForEmail(email);
  if (!scope) redirect("/login");

  const params = (await searchParams) ?? {};

  // Guides have a dedicated mobile queue; managers have their own surface.
  const role = roleForScope(scope);
  if (role === "guide") {
    redirect(buildRedirect("/dashboard/guide", params));
  }
  if (role === "manager_readonly") {
    redirect(buildRedirect(scope.landing || "/dashboard/manager", params));
  }
  if (role === "subject_dri") {
    redirect(buildRedirect(scope.landing || "/dashboard/subject", params));
  }

  const result = await loadDashboardData(email);
  if (result.kind === "no_access") redirect("/login");
  if (result.kind === "pending") {
    return (
      <PendingShell scope={scope} message={result.message} userEmail={email} />
    );
  }

  return (
    <UnifiedDashboard
      scope={scope}
      payload={result.payload}
      searchParams={params}
      userEmail={email}
    />
  );
}

function buildRedirect(
  base: string,
  params: Record<string, string | string[] | undefined>
): string {
  const qs: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v) qs[k] = v;
  }
  const search = new URLSearchParams(qs).toString();
  return search ? `${base}?${search}` : base;
}

/* ------------------------------------------------------------------ */
/* Pending shell — shown when source data isn't available yet         */
/* ------------------------------------------------------------------ */

interface PendingShellProps {
  scope: DriScope;
  message: string;
  userEmail: string;
}

function PendingShell({ scope, message, userEmail }: PendingShellProps) {
  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="text-xl flex-shrink-0"
              aria-label="Home"
            >
              🧠
            </Link>
            <div className="min-w-0">
              <h1 className="font-semibold text-ink text-sm truncate">
                Alpha Brain Dashboard
              </h1>
              <p className="text-xs text-stone-500 truncate">{scope.role}</p>
            </div>
          </div>
          <span className="hidden md:inline text-xs text-stone-500">
            {userEmail}
          </span>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-base font-semibold text-ink">
            Dashboard data not yet available
          </h2>
          <p className="text-sm text-stone-600 mt-2 leading-relaxed">
            {message}
          </p>
        </div>
      </div>
    </main>
  );
}
