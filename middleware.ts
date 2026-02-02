import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  
  // 1. BYPASS: If the request is for the API, let it pass.
  // We want the search to be public for the MVP.
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // 2. PUBLIC ROUTES: These should always be accessible, never redirect
  // Exact matches
  const publicExactPaths = ['/', '/get-started', '/onboarding', '/chat', '/waitlist']
  // Prefix matches
  const publicPrefixPaths = ['/waitlist/', '/api/']
  
  const isPublicRoute = 
    publicExactPaths.includes(pathname) ||
    publicPrefixPaths.some(prefix => pathname.startsWith(prefix)) ||
    pathname.startsWith('/auth/') // Auth pages are always public

  // If it's a public route, allow access without auth check
  if (isPublicRoute) {
    // Optional: Redirect logged-in users away from auth pages (but allow them to access other public routes)
    if (user && (pathname.startsWith('/auth/signin') || pathname.startsWith('/auth/signup'))) {
      return NextResponse.redirect(new URL('/chat', request.url))
    }
    return response
  }

  // 3. PROTECTED ROUTES: Require login for private app routes
  // If user tries to access these without login, redirect to sign-in
  const protectedRoutes = ['/home', '/favorites', '/settings']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  
  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - logos (YOUR NEW LOGO FOLDER) <--- THIS IS THE FIX
     * - public (sometimes needed)
     */
    '/((?!_next/static|_next/image|favicon.ico|logos|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}