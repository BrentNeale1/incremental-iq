import { QueryClient } from '@tanstack/react-query';

/**
 * SSR-safe QueryClient singleton.
 *
 * - Server: a fresh instance is created per request (no shared state between requests)
 * - Browser: a single cached instance is reused for the lifetime of the page
 *
 * staleTime of 60_000ms (1 minute) means data fetched from the server is
 * considered fresh for 1 minute before triggering a background refetch.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create a new QueryClient
    return makeQueryClient();
  }

  // Browser: reuse the same QueryClient instance
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }

  return browserQueryClient;
}
