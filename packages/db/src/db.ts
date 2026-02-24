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
  return db.transaction(async (tx) => {
    // SET LOCAL scopes the config to this transaction only
    await tx.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`);
    return fn(tx);
  });
}
