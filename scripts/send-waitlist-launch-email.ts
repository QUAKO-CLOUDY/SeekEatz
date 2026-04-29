import dotenv from "dotenv";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendWaitlistLaunchEmail } from "@/lib/email/resend";

dotenv.config({ path: ".env.local" });

type WaitlistSignupRow = {
  email: string;
  is_free_month: boolean | null;
  redeemed_at: string | null;
};

type CliOptions = {
  shouldSend: boolean;
  includeRedeemed: boolean;
  limit: number | null;
  appUrl: string;
};

function parseArgs(argv: string[]): CliOptions {
  const shouldSend = argv.includes("--send");
  const includeRedeemed = argv.includes("--include-redeemed");

  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
  const parsedLimit =
    limit != null && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;

  const appUrlArg = argv.find((arg) => arg.startsWith("--app-url="));
  const appUrl = appUrlArg?.split("=")[1]?.trim() || "https://www.seekeatz.com";

  return {
    shouldSend,
    includeRedeemed,
    limit: parsedLimit,
    appUrl,
  };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();

  let query = admin
    .from("waitlist_signups")
    .select("email, is_free_month, redeemed_at")
    .eq("is_free_month", true)
    .order("created_at", { ascending: true });

  if (!options.includeRedeemed) {
    query = query.is("redeemed_at", null);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load waitlist signups: ${error.message}`);
  }

  const rows = (data ?? []) as WaitlistSignupRow[];
  const dedupedEmails = Array.from(
    new Set(rows.map((row) => normalizeEmail(row.email)).filter(Boolean)),
  );

  if (dedupedEmails.length === 0) {
    console.log("No matching waitlist recipients found.");
    return;
  }

  console.log(
    `Recipients: ${dedupedEmails.length} (${options.includeRedeemed ? "including redeemed" : "unredeemed only"})`,
  );

  if (!options.shouldSend) {
    console.log("Dry run only. Add --send to deliver emails.");
    console.log("Sample recipients:");
    for (const recipient of dedupedEmails.slice(0, 20)) {
      console.log(`- ${recipient}`);
    }
    return;
  }

  let sent = 0;
  let failed = 0;
  const failures: Array<{ email: string; error: string }> = [];

  for (const email of dedupedEmails) {
    try {
      const result = await sendWaitlistLaunchEmail({
        to: email,
        appUrl: options.appUrl,
      });
      if (result.error) {
        failed += 1;
        failures.push({ email, error: JSON.stringify(result.error) });
        continue;
      }
      sent += 1;
    } catch (err) {
      failed += 1;
      failures.push({
        email,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  console.log(`Waitlist launch send complete. Sent: ${sent}. Failed: ${failed}.`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const failure of failures) {
      console.log(`- ${failure.email}: ${failure.error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
