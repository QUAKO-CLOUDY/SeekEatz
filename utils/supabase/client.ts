import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

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

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
