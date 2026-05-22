import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const USER_OWNED_TABLES = [
  "usage_events",
  "saved_meals",
  "daily_logs",
  "user_favorites",
  "app_store_subscriptions",
  "chat_sessions",
  "chat_messages",
  "conversations",
];

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  const message = candidate.message?.toLowerCase() ?? "";
  return (
    candidate.code === "42P01" ||
    candidate.code === "42703" ||
    candidate.code === "PGRST204" ||
    candidate.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("column") ||
    message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

function isAuthUserNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  const message = candidate.message?.toLowerCase() ?? "";
  return (
    candidate.code === "user_not_found" ||
    candidate.code === "USER_NOT_FOUND" ||
    message.includes("user not found") ||
    message.includes("not found")
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("Supabase admin client is not configured")) {
      return "Account deletion is temporarily unavailable. Please contact support@seekeatz.com.";
    }

    return error.message;
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    const parts = [candidate.message, candidate.details, candidate.hint]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());

    if (parts.length > 0) {
      return parts.join(" ");
    }

    if (candidate.code) {
      return `Account deletion failed (${candidate.code}).`;
    }
  }

  return "Failed to delete account";
}

async function deleteRowsIfPresent(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  value: string,
) {
  const result = await admin.from(table).delete().eq(column, value);
  if (result?.error && !isMissingSchemaError(result.error)) {
    throw result.error;
  }
}

async function selectValuesIfPresent(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  selectColumn: string,
  whereColumn: string,
  whereValue: string,
): Promise<string[]> {
  const result = await admin.from(table).select(selectColumn).eq(whereColumn, whereValue);
  if (result?.error) {
    if (isMissingSchemaError(result.error)) {
      return [];
    }
    throw result.error;
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const value = (row as Record<string, unknown>)[selectColumn];
      return typeof value === "string" && value.length > 0 ? value : null;
    })
    .filter((value): value is string => typeof value === "string");
}

async function deleteRowsByValuesIfPresent(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  values: string[],
) {
  if (values.length === 0) {
    return;
  }

  const result = await admin.from(table).delete().in(column, values);
  if (result?.error && !isMissingSchemaError(result.error)) {
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

    const admin = createAdminClient();

    // Collect cross-table references before deleting parent rows.
    const sessionIds = await selectValuesIfPresent(
      admin,
      "chat_sessions",
      "session_id",
      "user_id",
      user.id,
    );

    const conversationIds = await selectValuesIfPresent(
      admin,
      "conversations",
      "id",
      "user_id",
      user.id,
    );

    await deleteRowsByValuesIfPresent(admin, "messages", "session_id", sessionIds);
    await deleteRowsByValuesIfPresent(admin, "messages", "conversation_id", conversationIds);

    for (const table of USER_OWNED_TABLES) {
      await deleteRowsIfPresent(admin, table, "user_id", user.id);
    }

    await deleteRowsIfPresent(admin, "profiles", "id", user.id);

    const { error: hardDeleteError } = await admin.auth.admin.deleteUser(user.id);
    if (hardDeleteError && !isAuthUserNotFoundError(hardDeleteError)) {
      const { error: softDeleteError } = await admin.auth.admin.deleteUser(user.id, true);
      if (softDeleteError && !isAuthUserNotFoundError(softDeleteError)) {
        throw softDeleteError;
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete account:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
