import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

/**
 * Resolve the authenticated user for an API route. Tries the session cookie
 * first, then falls back to an Authorization: Bearer <access_token> header.
 * The WebView sometimes fails to attach cookies on fetch even when the client
 * session is valid in local storage — the bearer fallback fixes that.
 */
export async function getRequestUser(
  request?: Request,
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const supabase = await createClient();

  const {
    data: { user: cookieUser },
  } = await supabase.auth.getUser();

  if (cookieUser) {
    return { supabase, user: cookieUser };
  }

  const authHeader = request?.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      const {
        data: { user: tokenUser },
      } = await supabase.auth.getUser(token);
      if (tokenUser) {
        return { supabase, user: tokenUser };
      }
    }
  }

  return { supabase, user: null };
}
