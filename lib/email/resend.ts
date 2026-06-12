import { Resend } from "resend";
import { getAppStoreUrl } from "@/lib/app-store";
import { buildPasswordResetEmailContent } from "@/lib/email/password-reset-template";
import { buildWaitlistLaunchEmailContent } from "@/lib/email/waitlist-launch-template";

export function getResendFromEmail(): string {
  const configured = process.env.RESEND_FROM_EMAIL?.trim();
  if (!configured) {
    return "onboarding@resend.dev";
  }

  if (configured.includes("<")) {
    return configured;
  }

  return `SeekEatz <${configured}>`;
}

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing RESEND_API_KEY. Add RESEND_API_KEY=re_xxxxxxxxx to your environment and replace re_xxxxxxxxx with your real Resend API key.",
    );
  }

  return new Resend(apiKey);
}

export async function sendResendHelloEmail(to: string) {
  const resend = getResendClient();

  return resend.emails.send({
    from: getResendFromEmail(),
    to,
    subject: "Hello World",
    html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
  });
}

type WaitlistFreeMonthEmailInput = {
  to: string;
  trialEndsAtIso?: string | null;
  appUrl?: string | null;
};

type WaitlistLaunchEmailInput = {
  to: string;
  appUrl?: string | null;
};

function formatTrialEndDate(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function sendWaitlistFreeMonthGrantedEmail({
  to,
  trialEndsAtIso,
  appUrl,
}: WaitlistFreeMonthEmailInput) {
  const resend = getResendClient();
  const formattedEndDate = formatTrialEndDate(trialEndsAtIso);
  const safeAppUrl = appUrl?.trim() || "https://www.seekeatz.com";
  const trialEndLine = formattedEndDate
    ? `Your free month is active through ${formattedEndDate}.`
    : "Your free month is now active.";

  return resend.emails.send({
    from: getResendFromEmail(),
    to,
    subject: "Your SeekEatz free month is live",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
        <h1 style="font-size:24px;margin:0 0 12px;">You got your SeekEatz free month</h1>
        <p style="margin:0 0 12px;">Thanks for joining the waitlist.</p>
        <p style="margin:0 0 12px;">${trialEndLine}</p>
        <p style="margin:0 0 20px;">
          Open SeekEatz and start finding high-protein meals that match your goals.
        </p>
        <a
          href="${safeAppUrl}"
          style="display:inline-block;background:#111827;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;"
        >
          Open SeekEatz
        </a>
      </div>
    `,
    text: `You got your SeekEatz free month.\n\nThanks for joining the waitlist.\n${trialEndLine}\n\nOpen SeekEatz: ${safeAppUrl}`,
  });
}

type PasswordResetEmailInput = {
  to: string;
  resetLink: string;
};

export async function sendPasswordResetEmail({ to, resetLink }: PasswordResetEmailInput) {
  const resend = getResendClient();
  const content = buildPasswordResetEmailContent({ resetLink });

  return resend.emails.send({
    from: getResendFromEmail(),
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
}

export async function sendWaitlistLaunchEmail({
  to,
  appUrl,
}: WaitlistLaunchEmailInput) {
  const resend = getResendClient();
  const safeAppUrl = appUrl?.trim() || getAppStoreUrl();
  const content = buildWaitlistLaunchEmailContent({
    to,
    appUrl: safeAppUrl,
  });

  return resend.emails.send({
    from: getResendFromEmail(),
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
}
