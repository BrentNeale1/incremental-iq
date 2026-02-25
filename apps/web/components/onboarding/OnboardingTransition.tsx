'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  connectedPlatforms: string[];
}

const PLATFORM_LABELS: Record<string, { name: string; detail: string }> = {
  meta: { name: 'Meta Ads', detail: 'importing up to 3 years of data' },
  google: { name: 'Google Ads', detail: 'importing up to 3 years of data' },
  shopify: { name: 'Shopify', detail: 'importing revenue and order history' },
  ga4: { name: 'Google Analytics 4', detail: 'importing conversion event data' },
};

const REDIRECT_SECONDS = 10;

/**
 * OnboardingTransition — post-completion fade screen shown after wizard finishes.
 *
 * Per CONTEXT.md: "fade to a clean transition screen showing data ingestion
 * overview, then auto-redirect to dashboard after ~10 seconds"
 *
 * Behavior:
 *   - Fade-in animation on mount (CSS transition opacity 0→1)
 *   - Shows connected platforms with import details
 *   - Countdown timer from 10 to 0
 *   - Auto-redirects to / (dashboard home) after 10 seconds
 *   - Manual "Go to Dashboard" button for impatient users
 *   - Cleanup timeout on unmount to prevent memory leaks
 */
export function OnboardingTransition({ connectedPlatforms }: Props) {
  const router = useRouter();
  const [visible, setVisible] = React.useState(false);
  const [countdown, setCountdown] = React.useState(REDIRECT_SECONDS);

  // Fade-in on mount
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setVisible(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Auto-redirect after REDIRECT_SECONDS
  React.useEffect(() => {
    const redirectTimer = setTimeout(() => {
      router.push('/');
    }, REDIRECT_SECONDS * 1000);

    return () => clearTimeout(redirectTimer);
  }, [router]);

  // Countdown ticker
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const knownPlatforms = connectedPlatforms.filter((p) => PLATFORM_LABELS[p]);
  const unknownPlatforms = connectedPlatforms.filter((p) => !PLATFORM_LABELS[p]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-6 transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/* Success icon */}
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-950">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">You&apos;re all set!</h2>
        <p className="text-muted-foreground">We&apos;re importing your data now.</p>
      </div>

      {/* Connected platforms list */}
      {connectedPlatforms.length > 0 && (
        <div className="w-full max-w-sm space-y-2">
          <p className="text-sm font-medium text-left">What&apos;s happening:</p>
          <ul className="space-y-1.5 text-left">
            {knownPlatforms.map((platform) => {
              const info = PLATFORM_LABELS[platform];
              return (
                <li key={platform} className="flex items-start gap-2 text-sm">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">&#x2713;</span>
                  <span>
                    <strong>{info.name}</strong> &mdash; {info.detail}
                  </span>
                </li>
              );
            })}
            {unknownPlatforms.map((platform) => (
              <li key={platform} className="flex items-start gap-2 text-sm">
                <span className="text-green-500 mt-0.5 flex-shrink-0">&#x2713;</span>
                <span>
                  <strong>{platform}</strong> &mdash; importing data
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Estimated wait */}
      <div className="rounded-lg border bg-muted/30 px-6 py-4 space-y-1">
        <p className="text-sm font-medium">Your first analysis will be ready in 2–4 hours</p>
        <p className="text-xs text-muted-foreground">
          Data ingestion runs in the background — you can explore the dashboard now.
        </p>
      </div>

      {/* Redirect countdown */}
      <p className="text-sm text-muted-foreground">
        Redirecting to dashboard in {countdown} second{countdown !== 1 ? 's' : ''}...
      </p>

      {/* Manual redirect button */}
      <Button onClick={() => router.push('/')} variant="default">
        Go to Dashboard
      </Button>
    </div>
  );
}
