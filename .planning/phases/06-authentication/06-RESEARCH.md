# Phase 6: Authentication - Research

**Researched:** 2026-02-25
**Domain:** Email/password authentication with session management on Next.js 15 App Router + Drizzle + PostgreSQL
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Forgot password**: email reset link flow (send-link, click, set-new-password) — standard, no magic codes
- **Sessions**: always persistent 30-day duration, no "remember me" checkbox
- **Sliding window renewal**: each authenticated request resets the 30-day timer — active users never expire
- **Multiple concurrent sessions**: allowed (laptop + phone simultaneously)
- **Session expiry UX**: soft redirect — brief "Session expired" toast, then redirect to /login
- **Generic error messages**: "Invalid email or password" on failed login — no account existence leakage
- **Post-login redirect**: always dashboard home, never the previous page
- **Auth page design**: centered card, Vercel/Linear style, minimal background
- **Separate pages**: /login and /signup as distinct routes with cross-links
- **Unauthenticated redirect**: all visitors go to /login immediately — no landing page, no dashboard preview
- **Logout location**: sidebar user menu — user avatar/name at bottom of AppSidebar, dropdown with "Log out"
- **Auth page aesthetic**: matches existing dashboard (shadcn/ui components, same theme)

### Claude's Discretion

- Sign-up form fields and password strength requirements
- Email verification flow details (whether required before access)
- Password reset token expiry and security details
- Rate limiting on login attempts
- Form validation patterns and inline error styling
- Loading states during auth operations
- Exact card styling, spacing, and typography on auth pages

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
- Role-based access control (AUTH-04 through AUTH-07 are v2)
- Team/agency accounts
- SSO
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can sign up with email and password | Better Auth `emailAndPassword: { enabled: true }` + `signUp.email()` client call + `/signup` page |
| AUTH-02 | User can log in with session persistence across browser refresh | Better Auth session: 30-day `expiresIn`, sliding `updateAge`, cookie-backed — survives page reload by design |
| AUTH-03 | User can log out from any page | `authClient.signOut()` from sidebar dropdown — session immediately revoked in database, cookie cleared |
</phase_requirements>

---

## Summary

Better Auth (v1.4.x) is the right library for this phase. It integrates directly with the project's existing Drizzle/postgres.js stack via a first-party `drizzleAdapter`, runs on Next.js 15 App Router, and implements 30-day sliding-window sessions out of the box via `expiresIn` / `updateAge` config. No secondary storage (Redis) is required for session management — sessions are database-backed in Better Auth's own `session` table.

The project already has `resend` and `react-email` installed in `apps/web`. Better Auth's `sendResetPassword` hook accepts a custom email sender, so the password reset email plugs directly into the existing Resend setup with zero new dependencies for email.

The key architectural decision is the **user-to-tenant relationship**. The existing schema uses a `tenants` table as the multi-tenant root (no users table yet). Better Auth will create its own `user` table. The link between them must be explicit: a `tenantId` foreign key added to Better Auth's `user` table via `additionalFields`, populated at sign-up. All existing API routes that accept `tenantId` as a query parameter will be retrofitted to read it from the session instead.

**Primary recommendation:** Install Better Auth in `apps/web`, use `drizzleAdapter` against the existing `@incremental-iq/db` Drizzle instance, add `tenantId` as an `additionalField` on the user table, generate the auth schema with the Better Auth CLI into `packages/db/src/schema/auth.ts`, and wire route protection via Next.js middleware (`middleware.ts`) with page-level `auth.api.getSession()` validation.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | ^1.4.x (latest: 1.4.19) | Auth framework: sign-up, sign-in, session, password reset | TypeScript-native, Drizzle adapter, no vendor lock-in, active development |
| `better-auth/adapters/drizzle` | (bundled in better-auth) | Connects Better Auth to existing Drizzle db instance | First-party adapter, provider: "pg" matches postgres.js |
| `resend` | ^6.9.2 (already installed) | Sends password reset and email verification emails | Already in apps/web package.json |
| `@react-email/components` | ^1.0.8 (already installed) | Email template components | Already in apps/web package.json |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@better-auth/cli` | latest | Schema generation for Drizzle | Run once to generate auth tables schema |
| `sonner` | ^2.0.7 (already installed) | "Session expired" toast | Already used in project |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `better-auth` | `next-auth` (Auth.js v5) | NextAuth v5 is stable and well-documented but Drizzle adapter integration is more verbose; Better Auth has cleaner TypeScript ergonomics and native Drizzle support |
| `better-auth` | Clerk | Clerk is hosted SaaS, adds vendor dependency, costs money at scale; Better Auth is self-hosted |
| `better-auth` | Custom JWT implementation | Never hand-roll auth — see Don't Hand-Roll section |

**Installation:**
```bash
# Run from repo root (pnpm workspace)
pnpm add better-auth --filter @incremental-iq/web
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/web/
├── auth.ts                          # Server-side Better Auth instance (auth config)
├── auth-client.ts                   # Client-side auth client (createAuthClient)
├── middleware.ts                    # Route protection (cookie check → redirect)
├── app/
│   ├── (auth)/                     # Auth route group (no sidebar)
│   │   ├── layout.tsx              # Centered card layout, no AppSidebar
│   │   ├── login/
│   │   │   └── page.tsx            # /login page
│   │   ├── signup/
│   │   │   └── page.tsx            # /signup page
│   │   └── forgot-password/
│   │       └── page.tsx            # /forgot-password page
│   ├── reset-password/
│   │   └── page.tsx                # /reset-password?token=... (outside auth group)
│   ├── api/
│   │   └── auth/
│   │       └── [...all]/
│   │           └── route.ts        # Better Auth handler — toNextJsHandler(auth)
│   └── (dashboard)/
│       └── layout.tsx              # MODIFIED: add auth guard (getSession check)
packages/db/src/schema/
└── auth.ts                         # Better Auth generated schema (user, session, account, verification)
```

### Pattern 1: Auth Server Instance

Create `apps/web/auth.ts` — the single source of truth for Better Auth configuration.

```typescript
// apps/web/auth.ts
// Source: https://www.better-auth.com/docs/installation
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@incremental-iq/db";
import * as schema from "@incremental-iq/db/schema"; // re-export auth schema here

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      // Map Better Auth table names to Drizzle schema exports
      user: schema.authUser,
      session: schema.authSession,
      account: schema.authAccount,
      verification: schema.authVerification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }, _request) => {
      // Use existing Resend integration
      void sendPasswordResetEmail(user.email, url);
    },
    resetPasswordTokenExpiresIn: 3600, // 1 hour
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,  // 30 days (locked decision)
    updateAge: 60 * 60 * 24,        // Sliding window: extend every 1 day of activity
  },
  user: {
    additionalFields: {
      tenantId: {
        type: "string",
        required: true,
        input: false,  // Set programmatically at sign-up, not user-provided
      },
    },
  },
});
```

### Pattern 2: Auth Client Instance

Create `apps/web/auth-client.ts` — the client-side instance used in React components.

```typescript
// apps/web/auth-client.ts
// Source: https://www.better-auth.com/docs/integrations/next
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});
```

### Pattern 3: API Route Handler

```typescript
// apps/web/app/api/auth/[...all]/route.ts
// Source: https://www.better-auth.com/docs/integrations/next
import { auth } from "@/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Pattern 4: Middleware (Optimistic Protection)

```typescript
// apps/web/middleware.ts
// Source: https://www.better-auth.com/docs/integrations/next
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password");

  // Unauthenticated user hitting protected route → redirect to /login
  if (!sessionCookie && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user hitting auth route → redirect to dashboard
  if (sessionCookie && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

**SECURITY NOTE:** `getSessionCookie()` only checks cookie existence — it does NOT validate the session in the database. This is the middleware layer for fast redirects only. Every protected server component and API route must call `auth.api.getSession()` for true validation.

### Pattern 5: Server-Side Session Access (Dashboard Layout)

```typescript
// apps/web/app/(dashboard)/layout.tsx — add auth guard
// Source: https://www.better-auth.com/docs/integrations/next
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const tenantId = session.user.tenantId; // custom field
  // Pass tenantId down via context or directly to components
  // ...existing layout code...
}
```

### Pattern 6: Sign-Up Flow (Creating User + Tenant)

Sign-up must atomically: (1) create the Better Auth user, (2) create a `tenants` row, (3) link them via `tenantId`. The safest approach is a server action or API route:

```typescript
// Sign-up page server action
async function handleSignUp(formData: FormData) {
  "use server";
  // 1. Create tenant first (get its UUID)
  const [tenant] = await db.insert(tenants).values({
    name: email.split("@")[0], // or from a "company name" field
    slug: generateSlug(email),
    plan: "starter",
  }).returning();

  // 2. Create Better Auth user with tenantId custom field
  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
      tenantId: tenant.id,  // custom field via additionalFields
    },
    headers: await headers(),
  });

  if (result.error) {
    // Rollback tenant creation if user creation fails
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    return { error: result.error.message };
  }

  redirect("/");
}
```

### Pattern 7: Sign-Out from Sidebar

```typescript
// In AppSidebar (client component)
import { authClient } from "@/auth-client";
import { useRouter } from "next/navigation";

const router = useRouter();

async function handleSignOut() {
  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        router.push("/login");
        router.refresh(); // Critical: clears Next.js router cache
      },
    },
  });
}
```

### Pattern 8: Existing API Routes — Retrofit Tenant Context

All existing API routes accept `tenantId` as a query param (e.g., `/api/dashboard/kpis?tenantId=...`). After auth, extract tenantId from the session instead:

```typescript
// Pattern for retrofitted API routes
import { auth } from "@/auth";
import { headers } from "next/headers";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  // Remove tenantId from searchParams, use session value instead
  // ...rest of existing route code...
}
```

### Anti-Patterns to Avoid

- **Trusting middleware alone for security:** `getSessionCookie()` in middleware is cookie existence only. Always call `auth.api.getSession()` in server components and API routes for real protection.
- **Awaiting email sending in auth hooks:** Use `void sendEmail(...)` (not `await`) inside `sendResetPassword` to prevent timing attacks that would reveal whether an email exists.
- **Forgetting `router.refresh()` after signOut:** Next.js App Router caches routes; without `router.refresh()`, protected pages remain accessible from the browser cache after logout.
- **Storing tenantId in the client session cookie only:** Always validate from `session.user.tenantId` server-side; never trust client-provided tenantId on sensitive endpoints.
- **Creating tenant and user in separate transactions without rollback:** If user creation fails after tenant creation, orphan tenant rows accumulate. The sign-up handler must delete the tenant on auth failure.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | bcrypt/argon2 custom wrapper | Better Auth (uses scrypt by default) | scrypt is OWASP-recommended, already integrated, handles salting |
| Session token generation | crypto.randomUUID | Better Auth session | Handles token rotation, expiry, revocation atomically |
| CSRF protection for auth forms | Manual CSRF token | Better Auth built-in | Already handles CSRF for its own endpoints |
| Password reset tokens | Custom token table | Better Auth verification table | Token expiry, single-use enforcement, timing-safe comparison already built |
| "Remember me" / persistent cookies | Custom cookie logic | Better Auth session (always persistent, locked decision) | Cookie maxAge tied to session expiresIn automatically |
| Rate limiting sign-in | Redis TTL counter | Better Auth built-in rate limiting | `/sign-in/email` limited to 3 requests/10 seconds by default in production |

**Key insight:** Every custom auth component has subtle security failures. Password reset flows, in particular, are notorious for timing attacks, token reuse bugs, and information leakage. Better Auth's implementation has been hardened by the community. Use it verbatim.

---

## Common Pitfalls

### Pitfall 1: Cookie Cache Invalidation After Logout
**What goes wrong:** If `session.cookieCache` is enabled for performance, a revoked session cookie may still appear valid to middleware for up to `maxAge` seconds after logout.
**Why it happens:** Cookie cache stores a signed copy of session data in the cookie itself; middleware reads the cookie without a DB round-trip.
**How to avoid:** Do not enable `cookieCache` in this phase. The default (DB-backed sessions, no cookie cache) gives immediate invalidation on logout — which is required by the AUTH-03 success criterion ("session is immediately invalidated").
**Warning signs:** Logout appears to work on one page but protected pages remain accessible for a few seconds.

### Pitfall 2: Next.js Router Cache After Logout
**What goes wrong:** After `authClient.signOut()`, navigating back to a dashboard page shows cached content.
**Why it happens:** Next.js App Router caches Server Component renders for the session; `signOut()` clears the auth cookie but the router cache still holds the rendered HTML.
**How to avoid:** Always call `router.refresh()` in the `onSuccess` callback of `signOut()`. This forces a full server re-render that will hit the auth guard and redirect to /login.
**Warning signs:** Dashboard content visible immediately after logout in the same tab.

### Pitfall 3: RSC Cannot Set Cookies
**What goes wrong:** Calling `auth.api.signInEmail()` from a React Server Component does not persist the session cookie.
**Why it happens:** RSCs run before the HTTP response is committed — they can read headers but not write Set-Cookie headers.
**How to avoid:** Sign-in and sign-up form submissions must either use client-side `authClient.signIn.email()` calls (which handle cookies via the browser) or Server Actions with the `nextCookies()` Better Auth plugin. For this project, use client-side calls from the Login/Signup form components.
**Warning signs:** User is "signed in" according to the response but gets redirected back to /login on next navigation.

### Pitfall 4: User Table vs. Tenants Table — ID Mismatch
**What goes wrong:** Using Better Auth's `user.id` as the `tenantId` for RLS (`app.current_tenant_id`).
**Why it happens:** Temptation to simplify by making user = tenant in a single-user system.
**How to avoid:** The existing schema is multi-tenant by design (`tenants` table is the isolation root). Better Auth's `user` table is a separate entity. The link is `user.tenantId → tenants.id`. Always pass `session.user.tenantId` to `withTenant()`, never `session.user.id`.
**Warning signs:** Data isolation breaks, users can see other users' data if tenant IDs are confused.

### Pitfall 5: Better Auth Schema Tables Not Exported from @incremental-iq/db
**What goes wrong:** Better Auth CLI generates schema into `schema.ts` at the project root; the `drizzleAdapter` can't find the tables.
**Why it happens:** The project uses a monorepo where the Drizzle schema lives in `packages/db/src/schema/`. CLI defaults to outputting into the consuming app's root.
**How to avoid:** Use `npx @better-auth/cli@latest generate --output packages/db/src/schema/auth.ts` to put the generated schema in the right package. Then export from `packages/db/src/schema/index.ts`. Then pass the `db` instance from `@incremental-iq/db` to `drizzleAdapter`.
**Warning signs:** Runtime error "undefined is not an object (evaluating 'e._.fullSchema')" — known Better Auth error when the schema is not properly wired.

### Pitfall 6: Tenants Table Has No RLS — But Auth Tables Need RLS-Bypass
**What goes wrong:** Adding RLS to Better Auth's `user`/`session` tables breaks Better Auth's own DB operations (it connects as `app_user` which would be blocked by RLS looking for `app.current_tenant_id` that isn't set during auth flows).
**Why it happens:** Better Auth reads/writes session and user tables outside of a tenant transaction context — there's no tenant identity yet during login.
**How to avoid:** Do NOT add RLS policies or FORCE ROW LEVEL SECURITY to Better Auth's managed tables (`user`, `session`, `account`, `verification`). These tables are system-level, not tenant-scoped. Tenant data isolation happens at the application layer by reading `tenantId` from the session.

### Pitfall 7: forgotPassword → requestPasswordReset Rename (v1.4 Breaking Change)
**What goes wrong:** Using `authClient.forgotPassword()` — this method was removed in Better Auth 1.4.
**Why it happens:** Breaking change in Better Auth 1.4 renamed the function.
**How to avoid:** Use `authClient.requestPasswordReset({ email, redirectTo })` — the new API name.
**Warning signs:** Runtime error "authClient.forgotPassword is not a function".

---

## Code Examples

Verified patterns from official sources:

### 30-Day Sliding Session Configuration
```typescript
// Source: https://www.better-auth.com/docs/concepts/session-management
session: {
  expiresIn: 60 * 60 * 24 * 30,  // 30 days total (2,592,000 seconds)
  updateAge: 60 * 60 * 24,        // Extend window every 1 day of activity
  // Do NOT set disableSessionRefresh — this would disable sliding window
  // Do NOT enable cookieCache — prevents immediate logout invalidation
}
```

### Sign-In with Error Handling (Client Component)
```typescript
// Source: https://www.better-auth.com/docs/authentication/email-password
const { data, error } = await authClient.signIn.email({
  email,
  password,
  // No callbackURL — locked decision: always redirect to dashboard home
});

if (error) {
  // Always show generic message — locked decision, no account existence leakage
  setError("Invalid email or password");
  return;
}
// On success, redirect to dashboard
router.push("/");
router.refresh();
```

### Password Reset Request
```typescript
// Source: https://www.better-auth.com/docs/authentication/email-password
// NOTE: v1.4 renamed forgotPassword → requestPasswordReset
const { error } = await authClient.requestPasswordReset({
  email,
  redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
});
// Always show success UI regardless of whether email exists (no leakage)
```

### getSession in Server Component
```typescript
// Source: https://www.better-auth.com/docs/integrations/next
import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session) redirect("/login");

const { user } = session;
// user.tenantId is the custom field linking to tenants table
```

### Better Auth CLI Schema Generation
```bash
# Source: https://www.better-auth.com/docs/concepts/cli
# Run from apps/web (where auth.ts lives)
npx @better-auth/cli@latest generate \
  --config ./auth.ts \
  --output ../../packages/db/src/schema/auth.ts
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `authClient.forgotPassword()` | `authClient.requestPasswordReset()` | Better Auth v1.4 | Use new name — old name removed |
| Passkey plugin in main package | `@better-auth/passkey` separate package | Better Auth v1.4 | Not relevant to this phase |
| `reactStartCookies` plugin | `tanstackStartCookies` | Better Auth v1.4 | Not relevant (not using TanStack Start) |
| Cookie-only middleware session check (Next.js < 15.2) | Node.js runtime in middleware for DB validation | Next.js 15.2+ | Project is on Next.js ^15.0; stay with cookie-based middleware + page-level DB validation |

**Deprecated/outdated:**
- `authClient.forgotPassword`: removed in v1.4 — use `authClient.requestPasswordReset`
- `advanced.generateId`: removed in v1.4 — use `advanced.database.generateId`

---

## Open Questions

1. **Email verification before access**
   - What we know: Better Auth supports `requireEmailVerification: true` in `emailAndPassword` config; Resend is already installed
   - What's unclear: User decision — require email verification before dashboard access, or allow unverified access?
   - Recommendation: Claude's discretion. Recommend NOT requiring verification before first access (lower friction for sign-up). Send verification email async but don't gate access. Can be enforced later.

2. **Sign-up form: company name field**
   - What we know: Sign-up requires creating a tenant row. Tenant has `name` and `slug` fields. Better Auth's `signUp.email()` only requires `email`, `password`, `name`.
   - What's unclear: Should sign-up ask for a company/account name (for the tenant), or derive it from the email domain?
   - Recommendation: Claude's discretion. Add a "Company name" field to the sign-up form. Map it to `tenant.name`. Derive slug from it via slugify. Simpler than email-domain parsing.

3. **Existing API route retrofit scope**
   - What we know: All 15+ existing API routes accept `tenantId` as a query parameter (e.g., `/api/dashboard/kpis?tenantId=...`). After auth, these should read tenantId from session, not from the request.
   - What's unclear: Should Phase 6 retrofit ALL routes, or just protect them and keep the query-param fallback?
   - Recommendation: Retrofit all routes to pull tenantId from session. Remove query-param tenantId entirely from client-side hook calls. This eliminates the IDOR vulnerability (any user can pass any tenantId today).

4. **Schema migration number**
   - What we know: Latest migration is `0005_markets_and_ga4.sql`. Auth tables will be `0006_auth.sql`.
   - What's unclear: Should Better Auth tables go in the same `packages/db` Drizzle schema export and migration, or be isolated?
   - Recommendation: Add to `packages/db` (same Drizzle instance, same migration chain). Export Better Auth tables from `packages/db/src/schema/auth.ts` and re-export from `index.ts`. This keeps one migration source of truth.

---

## Sources

### Primary (HIGH confidence)
- https://www.better-auth.com/docs/integrations/next — Next.js integration guide (fetched)
- https://www.better-auth.com/docs/installation — Installation and env vars (fetched)
- https://www.better-auth.com/docs/adapters/drizzle — Drizzle adapter configuration (fetched)
- https://www.better-auth.com/docs/concepts/database — Core schema tables (fetched)
- https://www.better-auth.com/docs/authentication/email-password — Email/password API (fetched)
- https://www.better-auth.com/docs/concepts/session-management — Session config (fetched)
- https://www.better-auth.com/docs/reference/options — betterAuth() config reference (fetched)
- https://www.better-auth.com/docs/concepts/cli — CLI generate command (fetched)
- https://www.better-auth.com/blog/1-4 — v1.4 breaking changes (fetched)

### Secondary (MEDIUM confidence)
- https://www.npmjs.com/package/better-auth — Current version 1.4.19 confirmed
- https://www.better-auth.com/docs/concepts/rate-limit — Rate limiting behavior (WebSearch verified)
- WebSearch: `getSessionCookie` + middleware pattern — confirmed by official docs

### Tertiary (LOW confidence)
- WebSearch: sign-up tenant creation pattern (community patterns, not in official docs)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Better Auth official docs fetched directly; existing packages confirmed from package.json
- Architecture: HIGH — Patterns verified against official documentation; existing codebase structure confirmed via file reads
- Pitfalls: MEDIUM-HIGH — Cookie cache + RSC + router.refresh pitfalls confirmed by official docs; tenant ID mismatch and RLS pitfalls are project-specific architectural inferences (but well-grounded)

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (Better Auth is actively developed; check for minor version changes before implementing)
