import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

function createBearerClient(accessToken: string): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/**
 * Resolve the authenticated user for an API route. Tries the session cookie
 * first, then falls back to an Authorization: Bearer <access_token> header.
 *
 * When the bearer path is used, the returned Supabase client also sends that
 * JWT to PostgREST so profile/usage reads run as the signed-in user instead
 * of anonymously (cookies are often missing in the WebView).
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
        error,
      } = await supabase.auth.getUser(token);

      if (tokenUser) {
        return { supabase: createBearerClient(token), user: tokenUser };
      }

      if (error) {
        console.warn("[auth] Bearer token rejected:", error.message);
      }
    }
  }

  return { supabase, user: null };
}
