'use client';

import * as React from 'react';

interface TenantContextValue {
  tenantId: string;
}

const TenantContext = React.createContext<TenantContextValue | null>(null);

/**
 * TenantProvider — provides tenantId from the authenticated session to all
 * client components in the dashboard.
 *
 * tenantId comes from session.user.tenantId (server-validated in DashboardLayout).
 * Client components use useTenantId() to access it — no more PLACEHOLDER_TENANT_ID.
 */
export function TenantProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ tenantId }), [tenantId]);
  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

/**
 * useTenantId — returns the current tenant's UUID from session context.
 *
 * Must be used within a component tree wrapped by TenantProvider
 * (i.e., inside the dashboard layout).
 */
export function useTenantId(): string {
  const ctx = React.useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenantId must be used within TenantProvider');
  }
  return ctx.tenantId;
}
