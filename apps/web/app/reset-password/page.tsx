'use client';

/**
 * Reset password page — set a new password using a reset token from email.
 *
 * IMPORTANT: This page is OUTSIDE the (auth) route group — it lives at
 * /reset-password?token=... and is accessed via the link in the password
 * reset email. It does NOT use the (auth) layout because it may be accessed
 * from a different browser session than the one that requested the reset.
 *
 * Token is read from URL search params and passed to authClient.resetPassword().
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/auth-client';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  // If no token in URL, show error immediately
  const noToken = !token;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsPending(true);

    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (resetError) {
        setError('This reset link has expired or is invalid. Please request a new one.');
        return;
      }

      setSuccess(true);
      // Redirect to /login after brief success state
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch {
      setError('This reset link has expired or is invalid. Please request a new one.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-4 pb-4">
          {/* Logo mark — matches AppSidebar branding */}
          <div className="flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-primary text-xs font-bold text-white">
              IQ
            </div>
          </div>
          <CardTitle className="text-center text-xl font-semibold">
            Set new password
          </CardTitle>
        </CardHeader>

        <CardContent>
          {noToken ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-destructive">
                This reset link is invalid or has expired.
              </p>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-foreground hover:underline"
              >
                Request a new reset link
              </Link>
            </div>
          ) : success ? (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Password reset successfully. Redirecting to login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isPending}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              {error?.includes('expired') && (
                <Link
                  href="/forgot-password"
                  className="block text-sm font-medium text-foreground hover:underline"
                >
                  Request a new reset link
                </Link>
              )}

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting password...
                  </>
                ) : (
                  'Reset password'
                )}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t pt-4">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordForm />
    </React.Suspense>
  );
}
