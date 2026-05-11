/**
 * POST /api/dashboard/admin/invite
 *
 * Master-only (Tripti) endpoint to send a Brain-dashboard onboarding
 * email to a DRI. Looks up the DRI scope from `lib/dri-scopes.ts`,
 * renders the onboarding body, and sends it via the shared mailer.
 *
 * Body: { email: string }   // the DRI's email
 * Response: { ok, sent_to, cc }
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  DRI_SCOPES,
  MASTER_DRI_SLUG,
  scopeForEmail,
} from "@/lib/dri-scopes";
import { sendEmail } from "@/lib/mailer";
import { renderOnboardingEmail } from "@/lib/emails/dashboard-onboarding";

const ADMIN_CC = process.env.ADMIN_CC ?? "tripti.khetan@trilogy.com";
const DEFAULT_DASHBOARD_ORIGIN =
  process.env.DASHBOARD_ORIGIN ?? "https://alpha-academic-ui.vercel.app";

interface InviteBody {
  email?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  const callerEmail = session?.user?.email?.toLowerCase();
  if (!callerEmail) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const callerScope = scopeForEmail(callerEmail);
  if (!callerScope || callerScope.dri !== MASTER_DRI_SLUG) {
    return NextResponse.json(
      { error: "Forbidden — master only" },
      { status: 403 }
    );
  }

  let body: InviteBody = {};
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    body = {};
  }

  const targetEmail = body.email?.trim().toLowerCase();
  if (!targetEmail) {
    return NextResponse.json(
      { error: "Missing required field: email" },
      { status: 400 }
    );
  }

  const targetScope = DRI_SCOPES[targetEmail];
  if (!targetScope) {
    return NextResponse.json(
      {
        error: `No DRI scope found for ${targetEmail}. Add an entry to lib/dri-scopes.ts first.`,
      },
      { status: 404 }
    );
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      {
        error:
          "Mailer not configured — set GMAIL_USER and GMAIL_APP_PASSWORD env vars.",
      },
      { status: 500 }
    );
  }

  const { subject, text } = renderOnboardingEmail(
    targetScope,
    DEFAULT_DASHBOARD_ORIGIN
  );

  const cc = targetScope.manager_email ?? undefined;

  try {
    const info = await sendEmail({
      to: targetScope.email,
      cc,
      bcc: ADMIN_CC,
      subject,
      text,
    });

    return NextResponse.json({
      ok: true,
      sent_to: targetScope.email,
      cc: cc ?? null,
      bcc: ADMIN_CC,
      message_id: info.messageId,
    });
  } catch (e) {
    const err = e as Error & { code?: string; response?: string };
    return NextResponse.json(
      {
        ok: false,
        error: `SMTP send failed: ${
          [err.code, err.message, err.response].filter(Boolean).join(" — ") ||
          err.message
        }`,
      },
      { status: 502 }
    );
  }
}
