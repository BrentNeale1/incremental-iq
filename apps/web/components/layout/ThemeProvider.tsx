'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

/**
 * ThemeProvider wraps next-themes to enable dark/light mode toggling.
 *
 * - attribute="class" — applies 'dark' class to <html> element
 * - defaultTheme="light" — light mode by default (aligns with brand guidelines)
 * - enableSystem — respects OS-level preference if user hasn't made a choice
 * - disableTransitionOnChange — prevents flash during initial theme load
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
