type WaitlistLaunchTemplateInput = {
  to: string;
  appUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildWaitlistLaunchEmailContent({
  to,
  appUrl,
}: WaitlistLaunchTemplateInput) {
  const safeEmail = escapeHtml(to);
  const safeAppUrl = escapeHtml(appUrl);
  const preheader =
    "SeekEatz is officially live on the App Store. Your 1-month Premium access is ready.";

  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your SeekEatz waitlist access is ready</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
            <tr>
              <td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#111827;">
                <p style="margin:0 0 16px;">Hi,</p>
                <p style="margin:0 0 16px;">
                  SeekEatz is officially live on the App Store! Thank you for joining the waitlist.
                </p>
                <p style="margin:0 0 20px;">
                  As promised, please enjoy 1 month of Premium with unlimited access to all features!
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;font-family:Arial,sans-serif;">
                      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">
                        How to claim your free month
                      </p>
                      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#334155;">
                        1. Download SeekEatz from the App Store.
                      </p>
                      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#334155;">
                        2. Create your account using this same email:
                        <strong style="color:#0f172a;">${safeEmail}</strong>
                      </p>
                      <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">
                        3. Your free month unlocks automatically. No code needed.
                      </p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                  <tr>
                    <td style="border-radius:8px;background:#0891b2;">
                      <a
                        href="${safeAppUrl}"
                        style="display:inline-block;padding:12px 20px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;"
                      >
                        Download on the App Store
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">
                  If you have any trouble, reply to this email or contact support@seekeatz.com.
                </p>
                <p style="margin:0;font-family:Arial,sans-serif;font-size:16px;color:#111827;">
                  - SeekEatz
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  const text = [
    "Hi,",
    "",
    "SeekEatz is officially live on the App Store! Thank you for joining the waitlist.",
    "",
    "As promised, please enjoy 1 month of Premium with unlimited access to all features!",
    "",
    "How to claim your free month:",
    "1. Download SeekEatz from the App Store.",
    `2. Create your account using this same email: ${to}`,
    "3. Your free month unlocks automatically. No code needed.",
    "",
    `Download on the App Store: ${appUrl}`,
    "",
    "If you have any trouble, reply to this email or contact support@seekeatz.com.",
    "",
    "- SeekEatz",
  ].join("\n");

  return {
    subject: "Your SeekEatz waitlist access is ready",
    html,
    text,
    greeting: "Hi,",
  };
}
