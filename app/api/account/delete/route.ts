import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

type UntypedSupabaseClient = {
  from: (table: string) => any;
  auth: {
    admin: {
      deleteUser: (userId: string, shouldSoftDelete?: boolean) => Promise<{ error: unknown | null }>;
    };
  };
};

const USER_OWNED_TABLES = [
  "usage_events",
  "saved_meals",
  "daily_logs",
  "user_favorites",
  "app_store_subscriptions",
];

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "42P01" ||
    candidate.code === "PGRST204" ||
    candidate.message?.toLowerCase().includes("does not exist") === true
  );
}

async function deleteRowsIfPresent(
  admin: UntypedSupabaseClient,
  table: string,
  column: string,
  value: string,
) {
  const result = await admin.from(table).delete().eq(column, value);
  if (result?.error && !isMissingTableError(result.error)) {
    throw result.error;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      confirmationText?: string;
    };

    if (body.confirmationText !== "DELETE") {
      return NextResponse.json(
        { error: "Invalid deletion confirmation" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient() as UntypedSupabaseClient;

    for (const table of USER_OWNED_TABLES) {
      await deleteRowsIfPresent(admin, table, "user_id", user.id);
    }

    await deleteRowsIfPresent(admin, "profiles", "id", user.id);

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      throw deleteUserError;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 },
    );
  }
}
