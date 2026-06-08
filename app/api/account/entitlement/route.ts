import { NextResponse } from "next/server";
import { GUEST_ENTITLEMENT } from "@/lib/entitlements";
import { getRequestEntitlement } from "@/lib/request-entitlement";

export async function GET(request: Request) {
  try {
    const { user, entitlement } = await getRequestEntitlement(request);

    if (!user) {
      return NextResponse.json(GUEST_ENTITLEMENT, { status: 200 });
    }

    return NextResponse.json(entitlement, { status: 200 });
  } catch (error) {
    console.error("Failed to load account entitlement:", error);
    return NextResponse.json(
      { error: "Failed to load entitlement" },
      { status: 500 },
    );
  }
}
