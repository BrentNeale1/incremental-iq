'use server';

/**
 * Sign-up server action — atomically creates tenant + Better Auth user.
 *
 * Pattern 6 from RESEARCH.md:
 *   1. Insert tenant row (gets its UUID)
 *   2. Create Better Auth user with tenantId custom field
 *   3. On user creation failure: rollback tenant row (prevents orphan tenants)
 *   4. On success: redirect to /login
 *
 * Called from the sign-up client component form.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, tenants } from '@incremental-iq/db';
import { auth } from '@/auth';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function signUpAction(
  formData: FormData
): Promise<{ error: string } | void> {
  const name = formData.get('name') as string;
  const companyName = formData.get('companyName') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  // Basic server-side validation
  if (!name || !companyName || !email || !password) {
    return { error: 'All fields are required' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  // Step 1: Create the tenant row first (to get its ID)
  let tenantId: string;
  try {
    const baseSlug = slugify(companyName) || slugify(email.split('@')[0]);
    // Append a short random suffix to avoid slug collisions
    const slugSuffix = Math.random().toString(36).slice(2, 6);
    const slug = `${baseSlug}-${slugSuffix}`;

    const [tenant] = await db
      .insert(tenants)
      .values({
        name: companyName,
        slug,
        plan: 'starter',
      })
      .returning();

    tenantId = tenant.id;
  } catch {
    return { error: 'Unable to create account. Please try again.' };
  }

  // Step 2: Create the Better Auth user, linking to the tenant
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        tenantId, // custom additionalField linking user → tenant
      },
      headers: await headers(),
    });

    if (result.error) {
      // Rollback: delete the tenant row to avoid orphans
      await db.delete(tenants).where(eq(tenants.id, tenantId));

      const message = result.error.message ?? '';

      if (message.toLowerCase().includes('email') || message.includes('23505')) {
        return { error: 'An account with this email already exists.' };
      }
      return { error: 'Unable to create account. Please try again.' };
    }
  } catch {
    // Rollback: delete the tenant row to avoid orphans
    await db.delete(tenants).where(eq(tenants.id, tenantId)).catch(() => {
      // Best-effort rollback — log would go here in production
    });
    return { error: 'Unable to create account. Please try again.' };
  }

  // Step 3: Redirect to /login — user created successfully
  // Note: Better Auth signUpEmail may set a session cookie automatically;
  // we redirect to /login so the user explicitly signs in. This avoids
  // auto-login complexity and keeps the flow simple.
  redirect('/login?registered=1');
}
