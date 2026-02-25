// Server component — validates session and passes tenantId to client layout
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { DashboardLayoutClient } from '@/components/layout/DashboardLayoutClient';

/**
 * DashboardLayout — server component wrapper for all dashboard pages.
 *
 * Responsibilities:
 *   1. Calls auth.api.getSession() with the current request headers for DB-level
 *      session validation (not just cookie existence — that's middleware's job).
 *   2. Redirects to /login if no valid session found.
 *   3. Extracts session.user.tenantId and passes it to the client layout.
 *
 * SECURITY: This is the definitive auth gate for all dashboard routes. The
 * middleware (middleware.ts) provides fast optimistic protection via cookie
 * check, but this server component performs the actual DB-backed validation.
 *
 * Pitfall 4 reminder: Always pass session.user.tenantId (not session.user.id)
 * to withTenant() calls. user.id and tenantId are different UUIDs.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = session.user.tenantId;
  const user = {
    name: session.user.name ?? '',
    email: session.user.email,
  };

  return (
    <DashboardLayoutClient tenantId={tenantId} user={user}>
      {children}
    </DashboardLayoutClient>
  );
}
