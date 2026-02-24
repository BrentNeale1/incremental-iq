'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from '@/lib/query/client';
import type { ReactNode } from 'react';

/**
 * QueryProvider wraps the app in TanStack QueryClientProvider.
 *
 * Uses the SSR-safe getQueryClient() singleton so the same QueryClient
 * is reused in the browser across navigations (avoiding refetches on
 * every route change).
 *
 * ReactQueryDevtools is included only in development builds and tree-shaken
 * in production.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
