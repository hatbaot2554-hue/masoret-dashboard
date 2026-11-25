import crypto from 'crypto';
import { createDbPool } from './db';

const pool = createDbPool();
let ready: Promise<unknown> | undefined;

export async function sharedRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  ready ||= pool.query(`CREATE TABLE IF NOT EXISTS security_request_limits (
    key TEXT PRIMARY KEY, hits INTEGER NOT NULL, resets_at TIMESTAMPTZ NOT NULL
  )`).catch(error => { ready = undefined; throw error; });
  await ready;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  // The conflict update serializes concurrent callers across all server instances.
  const result = await pool.query(`INSERT INTO security_request_limits (key, hits, resets_at)
    VALUES ($1, 1, NOW() + $2 * INTERVAL '1 millisecond')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN security_request_limits.resets_at <= NOW() THEN 1 ELSE LEAST(security_request_limits.hits + 1, $3 + 1) END,
      resets_at = CASE WHEN security_request_limits.resets_at <= NOW() THEN EXCLUDED.resets_at ELSE security_request_limits.resets_at END
    RETURNING hits`, [hash, windowMs, limit]);
  if (Math.random() < 0.01) await pool.query(`DELETE FROM security_request_limits WHERE resets_at < NOW() - INTERVAL '1 day'`);
  return Number(result.rows[0].hits) <= limit;
}
