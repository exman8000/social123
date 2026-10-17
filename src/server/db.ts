import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDatabasePool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_CONFIG_MISSING: DATABASE_URL não está configurada.');
  }

  if (!pool) {
    const isSsl = connectionString.includes('sslmode=require') || connectionString.includes('supabase.co');
    pool = new Pool({
      connectionString,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 3000,
      max: 5,
    });
  }

  return pool;
}
