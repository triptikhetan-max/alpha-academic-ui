/**
 * Guide layout — mobile-first wrapper around the guide queue.
 *
 * Single-column, max-width 640px (max-w-screen-sm) so the same markup looks
 * sane on a 375px iPhone *and* in a desktop browser when a campus DRI peeks
 * at the guide view from their laptop. The bottom nav is rendered here so it
 * persists across guide subroutes when we add /dashboard/guide/students,
 * /dashboard/guide/done, etc. in a future PR.
 *
 * Auth: this layout sits inside the parent `app/dashboard/layout.tsx` which
 * already enforces `auth() + scopeForEmail`. We don't re-check session here.
 *
 * IMPORTANT: this layout should NOT touch the legacy /dashboard host page,
 * the brain chat, or any of the forbidden API routes. It is its own visual
 * world that only talks to /api/dashboard/feedback (PR 1).
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guide Queue · Alpha Brain",
};

export default function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 pb-20 text-gray-900">
      {/* Single-column shell. The fixed bottom nav is rendered by the page
          itself so we have access to the active tab from search params. */}
      <div className="mx-auto flex min-h-screen max-w-screen-sm flex-col">
        {children}
      </div>
    </div>
  );
}
