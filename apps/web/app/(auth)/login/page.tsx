'use client';

/**
 * Login page — email/password sign-in.
 *
 * Uses client-side authClient.signIn.email() because RSC cannot set cookies
 * (Pitfall 3). On success, always redirects to dashboard home (locked decision).
 * On error, shows generic "Invalid email or password" — no account existence
 * leakage (locked decision).
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        callbackURL: '/',
      });

      if (signInError) {
        // Locked decision: generic error — no account existence leakage
        setError('Invalid email or password');
        return;
      }

      // Locked decision: always redirect to dashboard home
      router.push('/');
      router.refresh();
    } catch {
      setError('Invalid email or password');
    } finally {
      setIsPending(false);
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
          Sign in to Incremental IQ
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isPending}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {"Don't have an account? "}
          <Link
            href="/signup"
            className="font-medium text-foreground hover:underline"
          >
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
