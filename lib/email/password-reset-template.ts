type PasswordResetTemplateInput = {
  resetLink: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPasswordResetEmailContent({ resetLink }: PasswordResetTemplateInput) {
  const safeLink = escapeHtml(resetLink);
  const subject = "Reset your SeekEatz password";

  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
            <tr>
              <td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#111827;">
                <p style="margin:0 0 16px;">Hi,</p>
                <p style="margin:0 0 16px;">
                  We received a request to reset your SeekEatz password. Tap the button below to choose a new one.
                </p>
                <p style="margin:0 0 20px;">
                  This link expires in 24 hours. If you did not request a password reset, you can ignore this email.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-radius:8px;background:#111827;">
                      <a
                        href="${safeLink}"
                        style="display:inline-block;padding:12px 20px;font-family:Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;"
                      >
                        Reset password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">
                  If the button does not work, copy and paste this link into your browser:
                </p>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#2563eb;">
                  <a href="${safeLink}" style="color:#2563eb;word-break:break-all;">${safeLink}</a>
                </p>
                <p style="margin:0;font-size:14px;color:#6b7280;">
                  Need help? Contact
                  <a href="mailto:support@seekeatz.com" style="color:#2563eb;">support@seekeatz.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Reset your SeekEatz password",
    "",
    "We received a request to reset your SeekEatz password.",
    "Open this link to choose a new password (expires in 24 hours):",
    resetLink,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "Need help? support@seekeatz.com",
  ].join("\n");

  return { subject, html, text };
}
