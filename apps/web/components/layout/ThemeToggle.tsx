'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

/**
 * ThemeToggle cycles through light -> dark -> system theme.
 * Uses next-themes' useTheme hook.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function handleToggle() {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      title={`Theme: ${theme ?? 'system'}`}
      className="h-8 w-8"
    >
      {theme === 'dark' ? (
        <Moon className="h-4 w-4" />
      ) : theme === 'system' ? (
        <Monitor className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
