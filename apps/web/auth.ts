// apps/web/auth.ts
// Source: https://www.better-auth.com/docs/installation
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, authUser, authSession, authAccount, authVerification } from "@incremental-iq/db";
import { Resend } from "resend";
import { PasswordResetEmail } from "@/emails/PasswordResetEmail";
import * as React from "react";

/**
 * Send a password reset email via Resend.
 *
 * SECURITY: Called with `void` (fire-and-forget, not awaited) inside
 * sendResetPassword to prevent timing attacks that could reveal whether
 * an email address exists in the system.
 */
async function sendPasswordResetEmail(email: string, url: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "Incremental IQ <noreply@incremental-iq.com>",
    to: email,
    subject: "Reset your Incremental IQ password",
    react: React.createElement(PasswordResetEmail, { resetUrl: url }),
  });
}

/**
 * Better Auth server instance.
 *
 * Configuration decisions:
 * - emailAndPassword: enabled with 8–128 char password length
 * - session.expiresIn: 30 days (locked decision — always persistent, no "remember me")
 * - session.updateAge: 1 day (sliding window — active users never expire)
 * - cookieCache: NOT enabled (Pitfall 1 — immediate logout invalidation required by AUTH-03)
 * - tenantId additionalField: required, input: false (set programmatically at sign-up)
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      // void: fire-and-forget to prevent timing attacks (RESEARCH.md Anti-Patterns)
      void sendPasswordResetEmail(user.email, url);
    },
    resetPasswordTokenExpiresIn: 3600, // 1 hour
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days (locked decision)
    updateAge: 60 * 60 * 24, // Sliding window: extend on each day of activity
    // Do NOT set disableSessionRefresh — sliding window must stay active
    // Do NOT enable cookieCache — prevents immediate logout invalidation (AUTH-03)
  },

  user: {
    additionalFields: {
      tenantId: {
        type: "string",
        required: true,
        input: false, // Set programmatically at sign-up, not user-provided
      },
    },
  },
});
