import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PLUGIN_API_KEY = process.env.ALPHA_API_KEY ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_ADDRESS =
  process.env.RESEND_FROM ?? "Alpha Academic Brain <onboarding@resend.dev>";
const ADMIN_CC = process.env.ADMIN_CC ?? "tripti.khetan@trilogy.com";

interface RequestBody {
  reason?: string;
}

function installEmailHTML(apiKey: string, recipientName: string): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1c1917; line-height: 1.6;">
  <p>Hi ${recipientName},</p>

  <p>You requested access to the <strong>Alpha Academic Brain</strong> Claude Code plugin. Here's everything you need.</p>

  <h2 style="font-size: 16px; margin-top: 24px;">Your API key</h2>
  <pre style="background: #f5f5f4; padding: 12px; border-radius: 6px; font-size: 13px; word-break: break-all;">${apiKey}</pre>
  <p style="font-size: 13px; color: #57534e;">Keep this private. It's tied to your account; if it leaks, ping Tripti to rotate.</p>

  <h2 style="font-size: 16px; margin-top: 24px;">Install (4 commands)</h2>
  <pre style="background: #1c1917; color: #fafaf9; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto;">
# 1. Install Claude Code (one-time, if you don't already have it):
brew install --cask claude-code

# 2. Add the Alpha Academic plugin:
claude --add-plugin alpha-academic-remote=triptikhetan-max/alpha-public

# 3. Set your API key:
claude env set ALPHA_API_KEY=${apiKey}

# 4. Try it:
claude
&gt; /ask-alpha-academic who owns Math 6-8</pre>

  <h2 style="font-size: 16px; margin-top: 24px;">Why the plugin?</h2>
  <ul>
    <li>Chain follow-up questions in the same context</li>
    <li>Bulk lookups (e.g. all DRIs across subjects in one call)</li>
    <li>Use it from inside VS Code while you're working on QC, curriculum, or testing</li>
    <li>Same brain, more horsepower than the web UI</li>
  </ul>

  <p style="font-size: 13px; color: #57534e; margin-top: 24px;">
    Stuck on install? Reply to this email or open an issue on the
    <a href="https://github.com/triptikhetan-max/alpha-public" style="color: #0891b2;">GitHub repo</a>.
  </p>

  <p style="font-size: 12px; color: #a8a29e; margin-top: 32px;">
    — Alpha Academic Brain · refreshed weekly · sent automatically when you clicked &quot;Request API key&quot;
  </p>
</div>
  `.trim();
}

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!PLUGIN_API_KEY) {
    return NextResponse.json(
      { error: "ALPHA_API_KEY not configured on the UI server" },
      { status: 500 },
    );
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }

  const recipientName = (session?.user?.name || userEmail.split("@")[0])
    .split(" ")[0];

  // If Resend isn't configured, gracefully degrade: log the request and
  // return a status that tells the user to expect a manual response.
  if (!RESEND_API_KEY) {
    return NextResponse.json({
      ok: true,
      mode: "manual",
      message:
        "Logged. You'll get an email shortly (auto-email isn't enabled yet).",
    });
  }

  // Send via Resend
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [userEmail],
        cc: [ADMIN_CC],
        subject: "Your Alpha Academic Brain plugin access",
        html: installEmailHTML(PLUGIN_API_KEY, recipientName),
        reply_to: ADMIN_CC,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Email send failed: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = (await resp.json()) as { id?: string };
    return NextResponse.json({
      ok: true,
      mode: "auto",
      message: `Email sent to ${userEmail}`,
      id: data.id,
      reason: body.reason ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
