// apps/web/auth-client.ts
// Source: https://www.better-auth.com/docs/integrations/next
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client instance for use in React components.
 *
 * Usage examples:
 *   - Sign in:  authClient.signIn.email({ email, password })
 *   - Sign up:  authClient.signUp.email({ email, password, name })
 *   - Sign out: authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/login') } })
 *   - Password reset request: authClient.requestPasswordReset({ email, redirectTo })
 *   - Confirm reset: authClient.resetPassword({ newPassword, token })
 *
 * NOTE (Pitfall 7): Better Auth v1.4 renamed forgotPassword → requestPasswordReset.
 * Always use authClient.requestPasswordReset(), never authClient.forgotPassword().
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});
