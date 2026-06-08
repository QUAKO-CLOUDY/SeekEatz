import { NextResponse } from "next/server";
import { getAuthenticatedEntitlement } from "@/lib/server-request-entitlement";

export async function GET(request: Request) {
  try {
    const { entitlement } = await getAuthenticatedEntitlement(request);

    return NextResponse.json(entitlement, { status: 200 });
  } catch (error) {
    console.error("Failed to load account entitlement:", error);
    return NextResponse.json(
      { error: "Failed to load entitlement" },
      { status: 500 },
    );
  }
}
