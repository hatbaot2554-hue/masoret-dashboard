import { NextResponse } from 'next/server';
import { createDbPool } from '../../lib/db';

function classifyDbError(error: unknown): string {
  const record = error as { code?: string; message?: string };
  if (record?.code === '28P01') return 'DB_PASSWORD_REJECTED';
  if (record?.code === '3D000') return 'DB_NAME_NOT_FOUND';
  if (record?.code === '42501') return 'DB_PERMISSION_DENIED';
  if (record?.code === 'ENOTFOUND') return 'DB_HOST_NOT_FOUND';
  if (String(record?.message || '').toLowerCase().includes('self-signed')) return 'DB_SSL_CERTIFICATE';
  if (String(record?.message || '').toLowerCase().includes('sslmode')) return 'DB_SSLMODE_INVALID';
  return 'DB_CONNECTION_FAILED';
}

export async function GET() {
  const pool = createDbPool();

  try {
    const connection = await pool.query('SELECT current_database() AS database_name');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'orders')
      ORDER BY table_name
    `);

    return NextResponse.json({
      ok: true,
      database: connection.rows[0]?.database_name || null,
      hasUsersTable: tables.rows.some((row) => row.table_name === 'users'),
      hasOrdersTable: tables.rows.some((row) => row.table_name === 'orders'),
    });
  } catch (error) {
    console.error('connection-check failed', error);
    return NextResponse.json(
      {
        ok: false,
        code: classifyDbError(error),
      },
      { status: 500 }
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
