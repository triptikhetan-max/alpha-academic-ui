/**
 * Shared Gmail SMTP transport for the Brain dashboard email pipeline.
 *
 * Mirrors the inline transport used in `app/api/request-plugin/route.ts`
 * (kept untouched for backwards compatibility). Any new Brain-dashboard
 * email path should go through `sendEmail()` here.
 */
import nodemailer, { type SentMessageInfo, type Transporter } from "nodemailer";

export function getTransporter(): Transporter {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
  });
}

export interface SendEmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(
  opts: SendEmailOptions
): Promise<SentMessageInfo> {
  const transporter = getTransporter();
  return await transporter.sendMail({
    from: process.env.GMAIL_USER!,
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
