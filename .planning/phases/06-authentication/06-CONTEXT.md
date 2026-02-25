# Phase 6: Authentication - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

User sign-up, login with persistent sessions, and logout across the platform. This phase adds email/password authentication with session management on top of the completed analytics product. Role-based access, team accounts, and SSO are v2 concerns (AUTH-04 through AUTH-07).

</domain>

<decisions>
## Implementation Decisions

### Login experience
- Forgot password via email reset link (standard send-link, click, set-new-password flow)
- No "remember me" checkbox — sessions are always persistent (30-day)
- Generic error messages on failed login ("Invalid email or password") — no account existence leakage
- After successful login, always redirect to dashboard home (not previous page)

### Session behavior
- 30-day session duration
- Sliding window renewal — each authenticated request resets the 30-day timer, so active users never expire unexpectedly
- Multiple concurrent sessions allowed (user can be logged in on laptop and phone simultaneously)
- On session expiry: soft redirect — show brief "Session expired" toast, then redirect to /login

### Auth page design
- Centered card layout on simple background (Vercel/Linear style — clean, minimal)
- Separate pages: /login and /signup as distinct routes with cross-links
- Unauthenticated visitors redirected to /login immediately (no landing page, no dashboard preview)
- Logout action in sidebar user menu — user avatar/name at bottom of existing AppSidebar, click to reveal dropdown with "Log out"

### Claude's Discretion
- Sign-up form fields and password strength requirements
- Email verification flow details (whether required before access)
- Password reset token expiry and security details
- Rate limiting on login attempts
- Form validation patterns and inline error styling
- Loading states during auth operations
- Exact card styling, spacing, and typography on auth pages

</decisions>

<specifics>
## Specific Ideas

- Auth pages should match the existing dashboard aesthetic (shadcn/ui components, same theme)
- Login card style reference: Vercel/Linear — centered, clean, not cluttered
- Logout button lives in the existing sidebar (AppSidebar component) at the bottom with user info

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-authentication*
*Context gathered: 2026-02-25*
