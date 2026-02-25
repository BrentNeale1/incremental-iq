// Server component — validates session and checks onboarding status
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db, tenants } from '@incremental-iq/db';
import { eq } from 'drizzle-orm';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

/**
 * OnboardingPage — entry point for the onboarding wizard.
 *
 * Responsibilities:
 *   1. Validates session — redirects to /login if missing.
 *   2. Checks onboardingCompleted flag on the tenant row.
 *      If already onboarded, redirects to / (dashboard).
 *   3. Renders <OnboardingWizard> for non-onboarded users.
 *
 * SECURITY: Session validated here and in OnboardingLayout (double-check OK,
 * layout's redirect is the fast path, this one also checks onboarding status).
 *
 * DB: Queries tenants table directly (no withTenant) — consistent with
 * no-RLS rule for the root isolation table (same as dashboard layout).
 */
export default async function OnboardingPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const rows = await db
    .select({ onboardingCompleted: tenants.onboardingCompleted })
    .from(tenants)
    .where(eq(tenants.id, session.user.tenantId))
    .limit(1);

  // Returning onboarded user — redirect to dashboard
  if (rows[0]?.onboardingCompleted) {
    redirect('/');
  }

  return (
    <main className="flex flex-col items-center justify-start py-12 px-4 flex-1">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Incremental IQ</h1>
          <p className="text-muted-foreground mt-2">
            Connect your platforms to get started with campaign analysis.
          </p>
        </div>
        <OnboardingWizard />
      </div>
    </main>
  );
}
