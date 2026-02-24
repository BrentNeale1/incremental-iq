'use client';

import * as React from 'react';

/**
 * useMediaQuery — returns true if the given CSS media query matches.
 *
 * SSR-safe: returns `false` on server (no window). Updates reactively
 * as viewport changes via matchMedia event listener.
 *
 * @param query - CSS media query string (e.g. "(max-width: 768px)")
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQueryList = window.matchMedia(query);
    setMatches(mediaQueryList.matches);

    function handleChange(event: MediaQueryListEvent) {
      setMatches(event.matches);
    }

    mediaQueryList.addEventListener('change', handleChange);
    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}
