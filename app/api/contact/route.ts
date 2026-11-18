import { NextResponse } from 'next/server';
import { isDashboardRequest } from '../../lib/security';
import { createDbPool } from '../../lib/db';

const pool = createDbPool();

async function ensureContactTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }
    await ensureContactTable();
    const result = await pool.query('SELECT * FROM contact_requests ORDER BY created_at DESC LIMIT 200');
    return NextResponse.json({ requests: result.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'שגיאה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; phone?: string; email?: string; message?: string };
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const message = String(body.message || '').trim();

    if (!name || !phone || !message) {
      return NextResponse.json({ error: 'שם, טלפון והודעה הם שדות חובה' }, { status: 400 });
    }

    await ensureContactTable();
    const result = await pool.query(
      `INSERT INTO contact_requests (name, phone, email, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, phone, email, message]
    );

    return NextResponse.json({ success: true, request: result.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'שגיאה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
