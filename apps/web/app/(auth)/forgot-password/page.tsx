'use client';

/**
 * Forgot password page — request a password reset email.
 *
 * Uses authClient.requestPasswordReset() — NOT authClient.forgotPassword()
 * (Pitfall 7: v1.4 breaking change renamed the function).
 *
 * SECURITY: Always shows success message regardless of whether the email
 * exists (locked decision: no account existence leakage). The Better Auth
 * server uses void/fire-and-forget email sending to prevent timing attacks.
 */

import * as React from 'react';
import Link from 'next/link';
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [isPending, setIsPending] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);

    try {
      // NOTE: use requestPasswordReset, NOT forgotPassword (Pitfall 7 — v1.4 rename)
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/reset-password`,
      });
    } catch {
      // Intentionally swallow errors — always show success (no leakage)
    } finally {
      setIsPending(false);
      // Always show success regardless of whether email exists (locked decision)
      setSubmitted(true);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-4 pb-4">
        {/* Logo mark — matches AppSidebar branding */}
        <div className="flex justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-primary text-xs font-bold text-white">
            IQ
          </div>
        </div>
        <CardTitle className="text-center text-xl font-semibold">
          Reset your password
        </CardTitle>
      </CardHeader>

      <CardContent>
        {submitted ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              {"If an account exists with that email, you'll receive a password reset link shortly."}
            </p>
            <p className="text-xs text-muted-foreground">
              Check your spam folder if you don&apos;t see it within a few minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">
              Enter your email address and we&apos;ll send you a link to reset your
              password.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isPending}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending || !email}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send reset link'
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
  );
}
