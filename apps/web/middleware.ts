// apps/web/middleware.ts
// Source: https://www.better-auth.com/docs/integrations/next
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Route protection middleware.
 *
 * Provides optimistic route protection based on cookie existence.
 *
 * SECURITY NOTE: getSessionCookie() only checks whether a Better Auth session
 * cookie exists in the request — it does NOT validate the session against the
 * database. This is intentional: middleware runs on every request and must be
 * fast. The actual session validation (DB round-trip) happens in:
 *   - Dashboard layout: auth.api.getSession({ headers: await headers() })
 *   - Protected API routes: auth.api.getSession({ headers: await headers() })
 *
 * Routing logic:
 *   - No session cookie + not an auth route → redirect to /login
 *   - Session cookie + auth route → redirect to / (dashboard home)
 *   - Everything else → allow through
 *
 * Locked decisions honored:
 *   - All unauthenticated visitors go to /login immediately (no landing page)
 *   - Authenticated users accessing auth pages are redirected to dashboard home
 */
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password");

  // Unauthenticated user hitting a protected route → redirect to /login
  if (!sessionCookie && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user hitting an auth route → redirect to dashboard home
  if (sessionCookie && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except:
  //   - /api/auth/** — Better Auth internal endpoints (must not be redirected)
  //   - _next/static  — Next.js static assets
  //   - _next/image   — Next.js image optimization
  //   - favicon.ico   — Browser favicon request
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
