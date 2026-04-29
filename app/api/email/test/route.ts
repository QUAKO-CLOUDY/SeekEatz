import { NextResponse } from "next/server";
import { sendResendHelloEmail } from "@/lib/email/resend";

type RequestBody = {
  to?: string;
};

const DEFAULT_TEST_RECIPIENT = "imosswork555@gmail.com";

export async function POST(request: Request) {
  try {
    let to = DEFAULT_TEST_RECIPIENT;

    try {
      const body = (await request.json()) as RequestBody;
      if (typeof body?.to === "string" && body.to.trim()) {
        to = body.to.trim();
      }
    } catch {
      // Keep default recipient when body is empty/non-JSON.
    }

    const result = await sendResendHelloEmail(to);

    return NextResponse.json({
      ok: true,
      message: "Test email sent with Resend.",
      to,
      id: result.data?.id ?? null,
      error: result.error ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send test email.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

