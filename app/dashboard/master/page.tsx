/**
 * /dashboard/master — legacy redirect to the unified landing.
 *
 * Originally hosted Tripti's master operator cockpit. The unified dashboard
 * (PR 5) folds master + campus DRI views into a single comprehensive landing
 * at `/dashboard`, scope-filtered automatically. This route now redirects
 * there so old bookmarks keep working.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface MasterPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MasterDashboardPage({
  searchParams,
}: MasterPageProps) {
  const params = (await searchParams) ?? {};
  const qs: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v) qs[k] = v;
  }
  const search = new URLSearchParams(qs).toString();
  redirect(search ? `/dashboard?${search}` : "/dashboard");
}
