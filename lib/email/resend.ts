import { Resend } from "resend";
import { getAppStoreUrl } from "@/lib/app-store";

const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

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
    from: DEFAULT_FROM_EMAIL,
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
    from: DEFAULT_FROM_EMAIL,
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

export async function sendWaitlistLaunchEmail({
  to,
  appUrl,
}: WaitlistLaunchEmailInput) {
  const resend = getResendClient();
  const safeAppUrl = appUrl?.trim() || getAppStoreUrl();

  return resend.emails.send({
    from: DEFAULT_FROM_EMAIL,
    to,
    subject: "SeekEatz is live — your free month is ready",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
        <h1 style="font-size:24px;margin:0 0 12px;">SeekEatz is live on the App Store</h1>
        <p style="margin:0 0 12px;">Thanks for joining the waitlist. Your 1-month Premium trial is ready.</p>
        <p style="margin:0 0 12px;">
          <strong>Important:</strong> when you create your account in the app, use this same email address
          (<strong>${to}</strong>) and we will automatically unlock your free month.
        </p>
        <p style="margin:0 0 12px;">No coupon code is required.</p>
        <p style="margin:0 0 20px;">
          Download SeekEatz from the App Store, create your account, and start finding meals that fit your goals.
        </p>
        <a
          href="${safeAppUrl}"
          style="display:inline-block;background:#111827;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;"
        >
          Download on the App Store
        </a>
      </div>
    `,
    text: `SeekEatz is live on the App Store.\n\nThanks for joining the waitlist. Your 1-month Premium trial is ready.\n\nImportant: when you create your account in the app, use this same email address (${to}) and we will automatically unlock your free month.\nNo coupon code is required.\n\nDownload on the App Store: ${safeAppUrl}`,
  });
}
