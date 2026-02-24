import { pgRole } from 'drizzle-orm/pg-core';

/**
 * The application database role.
 * This role is granted to the application's database connection user.
 * All RLS policies use this role as the target — meaning RLS is enforced
 * when the application connects as this role.
 *
 * The role is declared as .existing() because it is created outside of
 * Drizzle migrations (e.g. by DBA scripts or infrastructure-as-code).
 */
export const appRole = pgRole('app_user').existing();
