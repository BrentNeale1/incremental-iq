import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL!;

// Use a pooling connection for the application
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

/**
 * Wraps all queries in a transaction with tenant context set via SET LOCAL.
 *
 * SET LOCAL scopes the config to this transaction only — it cannot leak
 * across requests or connections. RLS policies read
 * current_setting('app.current_tenant_id') to enforce isolation.
 *
 * Usage:
 *   const campaigns = await withTenant(tenantId, (tx) =>
 *     tx.select().from(schema.campaigns)
 *   );
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  // Validate UUID format to prevent SQL injection (SET LOCAL doesn't support $1 params)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }
  return db.transaction(async (tx) => {
    // SET LOCAL scopes the config to this transaction only
    // Must use sql.raw() because SET LOCAL doesn't accept parameterized values
    await tx.execute(sql`SET LOCAL app.current_tenant_id = '${sql.raw(tenantId)}'`);
    return fn(tx);
  });
}
