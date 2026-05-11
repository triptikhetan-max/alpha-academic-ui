/**
 * /dashboard/subject — REMOVED per product direction.
 *
 * Per Tripti 2026-04-29: there is no Subject DRI dashboard view. Subject DRIs
 * are notified via the escalation email path (POST /api/dashboard/feedback
 * with action: "escalated"). They do NOT have their own dashboard page.
 *
 * This route exists only as a friendly redirect for legacy bookmarks.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
  redirect("/dashboard");
}
