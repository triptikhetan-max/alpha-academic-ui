/**
 * Renders the onboarding email body for a Brain-dashboard DRI.
 *
 * Triggered manually by Tripti via the admin invite endpoint
 * (`app/api/dashboard/admin/invite/route.ts`) once a DRI is ready
 * to be looped in. The email links them straight to their landing
 * view (Claudio → /dashboard/triage, others → /dashboard).
 */
import type { DriScope } from "@/lib/dri-scopes";

export interface RenderedOnboardingEmail {
  subject: string;
  text: string;
}

export function renderOnboardingEmail(
  scope: DriScope,
  dashboardOrigin: string
): RenderedOnboardingEmail {
  const firstName = scope.name.split(" ")[0];
  const url = `${dashboardOrigin}${scope.landing}`;
  const triageNote =
    scope.dri === "claudio"
      ? " (your default landing — designed to walk through every flagged item per kid)"
      : "";

  const subject = `Your Brain dashboard view (${scope.name})`;

  const text = `Hi ${firstName},

Your private view of the Alpha Schools Brain dashboard is now live.
You'll see ${scope.role} — only kids and metrics in your scope.

  ${url}

You'll sign in with Google using your Alpha-affiliated email.
No password — just SSO.

What you'll see:
- Only your students. Sidebar hides the campuses outside your scope.
- Per-section feedback button (🚩) for "what's wrong / what's missing /
  what to improve". Submissions email me directly.
- Triage workflow${triageNote}.
- Daily digest of new flags arrives at 6am CT if there are 3+ in your scope.

If anything's broken, email me at tripti.khetan@trilogy.com.

— Tripti`;

  return { subject, text };
}
