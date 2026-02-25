// apps/web/app/api/auth/[...all]/route.ts
// Source: https://www.better-auth.com/docs/integrations/next
import { auth } from "@/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Better Auth catch-all API handler.
 *
 * Handles all Better Auth API routes under /api/auth/**:
 *   POST /api/auth/sign-in/email
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-out
 *   POST /api/auth/forget-password
 *   POST /api/auth/reset-password
 *   GET  /api/auth/get-session
 *   ...and all other Better Auth internal endpoints
 */
export const { GET, POST } = toNextJsHandler(auth);
