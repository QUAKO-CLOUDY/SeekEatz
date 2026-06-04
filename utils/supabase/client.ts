import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton browser client. Calling createBrowserClient on every createClient()
// invocation spins up a separate auth instance with its own token-refresh timer.
// Multiple instances refreshing the same (rotating) refresh token trips
// Supabase's reuse detection and emits SIGNED_OUT — i.e. random logouts while
// the app is idle. A single shared client keeps one session and one refresh
// loop, so an authenticated user stays signed in until they explicitly sign out.
let browserClient: SupabaseClient | undefined

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const message =
      "@supabase/ssr: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."

    // Next.js prerenders client components during build. If env vars are not
    // available in that build context, avoid failing prerender. Runtime usage
    // in the browser still throws so misconfiguration remains explicit.
    if (typeof window === 'undefined') {
      return {} as SupabaseClient
    }

    throw new Error(message)
  }

  // On the server (prerender), always return a fresh client — no singleton.
  if (typeof window === 'undefined') {
    return createBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  return browserClient
}
