import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Non-pooling, single connection for migrations (sequential execution)
const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });

async function runMigrations() {
  const db = drizzle(migrationClient);
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './migrations' });
  await migrationClient.end();
  console.log('Migrations complete');
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
