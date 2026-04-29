import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { auth } from "@/lib/auth";
import { issueKey } from "@/lib/plugin-keys";

const GMAIL_USER = process.env.GMAIL_USER ?? "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD ?? "";
const FROM_ADDRESS = GMAIL_USER
  ? `Tripti Khetan <${GMAIL_USER}>`
  : "Alpha Academic Brain <noreply@example.com>";
const ADMIN_CC = process.env.ADMIN_CC ?? "tripti.khetan@trilogy.com";

interface RequestBody {
  reason?: string;
}

function installEmailHTML(apiKey: string, recipientName: string): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #1c1917; line-height: 1.6;">
  <p>Hi ${recipientName},</p>

  <p>You're all set with the <strong>Alpha Academic Brain</strong> Claude Code plugin. This email has your personal API key + a 4-command install + how to actually use it.</p>

  <h2 style="font-size: 17px; margin-top: 28px; color: #0c4a6e;">What is this?</h2>
  <p style="margin: 0 0 8px;">
    A team-curated knowledge base of everything we know as the academics team:
    14 subjects (with current DRIs), 20 platforms, 75 architecture decisions,
    8 policies, 13 campuses, 1,396 supporting docs from chat + Drive + sheets,
    each with an AI summary. Refreshed weekly.
  </p>
  <p style="margin: 0;">
    Same brain, two surfaces: the
    <a href="https://alpha-academic-brain-delta.vercel.app" style="color: #0891b2;">web UI</a>
    is great for one-off questions. The plugin lets you query the brain from <strong>anywhere Claude Code runs</strong> — so if you already work in Claude Code, you don't have to tab over to the website to look something up.
  </p>

  <h2 style="font-size: 17px; margin-top: 28px; color: #0c4a6e;">Your personal API key</h2>
  <pre style="background: #f5f5f4; padding: 12px; border-radius: 6px; font-size: 13px; word-break: break-all; margin: 8px 0;">${apiKey}</pre>
  <p style="font-size: 13px; color: #57534e; margin: 0;">
    This is unique to your email. Don't share it externally — if it leaks, just request a fresh email from the web UI; same email always gets the same key (so re-installing isn't needed unless your master key rotates).
  </p>

  <h2 style="font-size: 17px; margin-top: 28px; color: #0c4a6e;">Install (4 commands, ~2 min)</h2>
  <pre style="background: #1c1917; color: #fafaf9; padding: 14px; border-radius: 6px; font-size: 12px; overflow-x: auto; line-height: 1.55;">
# 1. Install Claude Code (skip if already installed):
brew install --cask claude-code

# 2. Add the Alpha Academic plugin:
claude --add-plugin alpha-academic-remote=triptikhetan-max/alpha-public

# 3. Set your API key:
claude env set ALPHA_API_KEY=${apiKey}

# 4. Open Claude Code anywhere and try it:
claude
&gt; /ask-alpha-academic who owns Math 6-8</pre>

  <h2 style="font-size: 17px; margin-top: 28px; color: #0c4a6e;">How to ask (real examples)</h2>
  <ul style="margin: 4px 0 12px; padding-left: 22px;">
    <li><code>who owns Math 6-8</code> → DRI name + email + what they own</li>
    <li><code>what is the 3-attempt cap policy</code> → quoted rule + threshold</li>
    <li><code>where's the Mastery Targets sheet</code> → Drive link</li>
    <li><code>what did we decide about Math Academy penalties</code> → ADR + date + reasoning</li>
    <li><code>why is reading missing during bracketing</code> → support article</li>
    <li><code>what platforms does Math 6-8 use</code> → cross-cutting answer</li>
    <li><code>what changed in the brain in the last 7 days</code> → recent updates feed</li>
  </ul>
  <p style="margin: 0;">
    Be specific. <em>"Math 3-5"</em> beats <em>"math"</em>. Mention the subject, platform, or policy by name when you can.
  </p>

  <h2 style="font-size: 17px; margin-top: 28px; color: #0c4a6e;">If something's wrong or out of date</h2>
  <ul style="margin: 4px 0 12px; padding-left: 22px;">
    <li><strong>You're the DRI of that area</strong> — edit directly. From the web UI: 🚩 → "you own this" → save. From the plugin: <code>/alpha-academic-remote:ask-alpha-academic edit math-6-8 ...</code> (rolling out next).</li>
    <li><strong>You're not the DRI</strong> — flag it. Goes straight to the subject DRI as an approval email (cc'd to Tripti). They reply ✅ / ❌ and it lands on Monday's refresh. Always include a source link (Drive doc, sheet, chat thread) so the DRI can verify.</li>
    <li><strong>You want to improve the brain infrastructure</strong> (build scripts, schema, summarization, new entity kinds) — open a PR against <a href="https://github.com/triptikhetan-max/alpha-brain-v2" style="color: #0891b2;">alpha-brain-v2</a>. That's separate from content; reviewed by Tripti. Content edits go through the DRI flow above, not direct PRs.</li>
  </ul>

  <h2 style="font-size: 17px; margin-top: 28px; color: #0c4a6e;">How updates flow</h2>
  <ol style="margin: 4px 0 12px; padding-left: 22px;">
    <li>Anyone edits a markdown file in the GitHub repo (or via the UI buttons).</li>
    <li>Tripti reviews edits + approvals from DRIs in the weekly review log.</li>
    <li>Every Monday, build_brain.py regenerates the SQLite from the markdown vault, AI re-summarizes anything that changed, deploys.</li>
    <li>Your plugin / web UI start serving the fresh data automatically.</li>
  </ol>

  <p style="font-size: 13px; color: #57534e; margin-top: 28px;">
    Stuck on install? Reply to this email or open an issue at
    <a href="https://github.com/triptikhetan-max/alpha-public" style="color: #0891b2;">github.com/triptikhetan-max/alpha-public</a>.
  </p>

  <p style="font-size: 12px; color: #a8a29e; margin-top: 24px;">
    — Alpha Academic Brain · refreshed weekly · this email was sent automatically when you clicked "Request API key" in the web UI
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

  // Issue a stable per-user key (same email → same key, always)
  let userKey: string;
  try {
    userKey = issueKey(userEmail);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Key generation failed: ${(e as Error).message}. Make sure PLUGIN_KEY_MASTER_SECRET is set on the UI server.`,
      },
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

  // If Gmail SMTP isn't configured, gracefully degrade: return the key inline
  // so we don't fully lock the flow on a missing env var.
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return NextResponse.json({
      ok: true,
      mode: "manual",
      message:
        "Email isn't configured yet. Showing your key here instead — admin should set GMAIL_USER + GMAIL_APP_PASSWORD.",
      api_key: userKey,
    });
  }

  // Send via Gmail SMTP
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to: userEmail,
      cc: ADMIN_CC,
      replyTo: GMAIL_USER,
      subject: "Your Alpha Academic Brain plugin access",
      html: installEmailHTML(userKey, recipientName),
    });

    return NextResponse.json({
      ok: true,
      mode: "auto",
      message: `Email sent to ${userEmail}`,
      id: info.messageId,
      reason: body.reason ?? null,
    });
  } catch (e) {
    // Network or unexpected error — still return the key so the user isn't blocked.
    const err = e as Error & { code?: string; response?: string };
    console.error("[request-plugin] SMTP send failed:", {
      message: err.message,
      code: err.code,
      response: err.response,
    });
    const detail = [err.code, err.message, err.response]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json({
      ok: true,
      mode: "manual",
      message: `Email delivery hit an error — showing your key here instead.`,
      email_error: detail || err.message,
      api_key: userKey,
    });
  }
}
