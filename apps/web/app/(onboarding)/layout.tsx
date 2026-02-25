// Onboarding route group layout — isolated, no dashboard sidebar
import '@/app/globals.css';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { TenantProvider } from '@/lib/auth/tenant-context';
import { QueryProvider } from '@/components/layout/QueryProvider';

/**
 * OnboardingLayout — minimal server component layout for the /onboarding route.
 *
 * Intentionally does NOT include the dashboard sidebar, header, or any
 * navigation. Provides a clean full-page canvas for the wizard.
 *
 * Auth: validates session server-side and redirects to /login if missing.
 * TenantProvider: makes tenantId available to all child client components.
 */
export default async function OnboardingLayout({
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

  return (
    <TenantProvider tenantId={session.user.tenantId}>
      <QueryProvider>
        <div className="min-h-screen bg-background flex flex-col">
          {children}
        </div>
      </QueryProvider>
    </TenantProvider>
  );
}
