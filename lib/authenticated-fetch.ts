import { createClient } from "@/utils/supabase/client";

/**
 * Same-origin fetch that always sends credentials and, when available, the
 * Supabase access token as a Bearer header so API routes can authenticate
 * the user even when session cookies are missing in the WebView.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);

  try {
    const supabase = createClient();
    // Validate the session so the bearer token we send is current, not stale.
    const [{ data: { user } }, { data: { session } }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);

    if (user && session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch {
    // Proceed without a bearer token; cookie auth may still work.
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}
