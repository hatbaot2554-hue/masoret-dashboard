import { Pool } from 'pg';

const VALID_SSLMODES = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']);

function normalizedDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (process.env.NODE_ENV === 'production') {
      url.searchParams.delete('sslmode');
    } else {
      const sslmode = url.searchParams.get('sslmode');
      if (sslmode && !VALID_SSLMODES.has(sslmode)) {
        url.searchParams.delete('sslmode');
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const databaseGlobal = globalThis as typeof globalThis & { masoretDbPool?: Pool };

export function createDbPool(): Pool {
  if (databaseGlobal.masoretDbPool) return databaseGlobal.masoretDbPool;
  // Share a small pool across route modules in each server process.
  const pool = new Pool({
    connectionString: normalizedDatabaseUrl(process.env.DATABASE_URL),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', () => {
    // Do not log connection details or credentials from driver errors.
    console.error('Database idle connection failed; the pool will replace it.');
  });
  databaseGlobal.masoretDbPool = pool;
  return pool;
}

