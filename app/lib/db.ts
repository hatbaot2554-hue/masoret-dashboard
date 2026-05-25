import { Pool } from 'pg';

const VALID_SSLMODES = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']);

function normalizedDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const sslmode = url.searchParams.get('sslmode');
    if (!sslmode || !VALID_SSLMODES.has(sslmode)) {
      url.searchParams.set('sslmode', 'require');
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function createDbPool() {
  return new Pool({
    connectionString: normalizedDatabaseUrl(process.env.DATABASE_URL),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}
