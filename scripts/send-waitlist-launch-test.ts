import { getAppStoreUrl } from "@/lib/app-store";
import { getResendFromEmail, sendWaitlistLaunchEmail } from "@/lib/email/resend";
import { buildWaitlistLaunchEmailContent } from "@/lib/email/waitlist-launch-template";

const DEFAULT_TEST_RECIPIENT = "imosswork555@gmail.com";

function parseRecipient(argv: string[]): string {
  const toArg = argv.find((arg) => arg.startsWith("--to="));
  const value = toArg?.split("=")[1]?.trim();
  return value || DEFAULT_TEST_RECIPIENT;
}

async function main() {
  const to = parseRecipient(process.argv.slice(2));
  const appUrl = getAppStoreUrl();

  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY in .env.local");
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error("Missing RESEND_FROM_EMAIL in .env.local");
  }

  const preview = buildWaitlistLaunchEmailContent({ to, appUrl });

  console.log("Sending waitlist launch TEST email...");
  console.log(`  To:      ${to}`);
  console.log(`  From:    ${getResendFromEmail()}`);
  console.log(`  Subject: ${preview.subject}`);
  console.log(`  Greeting: ${preview.greeting}`);
  console.log(`  App URL: ${appUrl}`);

  const result = await sendWaitlistLaunchEmail({ to, appUrl });

  if (result.error) {
    console.error("Send failed:", result.error);
    process.exit(1);
  }

  console.log("Test email sent successfully.");
  console.log(`  Resend id: ${result.data?.id ?? "unknown"}`);
  console.log("Check the inbox (and spam) for the launch email.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
