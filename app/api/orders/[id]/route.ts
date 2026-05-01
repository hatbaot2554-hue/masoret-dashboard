import { Pool } from 'pg';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function getAuthSecret(): string {
  return process.env.DASHBOARD_AUTH_SECRET || process.env.DATABASE_URL || 'change-this-secret';
}

function sign(value: string): string {
  return crypto.createHmac('sha256', getAuthSecret()).update(value).digest('base64url');
}

function isDashboardRequest(request: Request): boolean {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload) !== signature) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
    }

    const id = params.id
    const body = await request.json() as {
      auto_submitted?: boolean
      checkout_url?: string
      external_order_id?: string
      status?: string
      admin_notes?: unknown
    }

    const { auto_submitted, checkout_url, external_order_id, status, admin_notes } = body

    const updates: string[] = []
    const values: (string | boolean)[] = []

    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes JSONB DEFAULT '[]'::jsonb`).catch(() => {})

    if (auto_submitted !== undefined) {
      values.push(auto_submitted)
      updates.push(`auto_submitted = $${values.length}`)
    }
    if (checkout_url !== undefined) {
      values.push(checkout_url)
      updates.push(`checkout_url = $${values.length}`)
    }
    if (external_order_id !== undefined) {
      values.push(external_order_id)
      updates.push(`external_order_id = $${values.length}`)
    }
    if (status !== undefined) {
      values.push(status)
      updates.push(`status = $${values.length}`)
    }
    if (admin_notes !== undefined) {
      values.push(JSON.stringify(admin_notes))
      updates.push(`admin_notes = $${values.length}::jsonb`)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
    }

    values.push(id)
    const result = await pool.query(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
    }

    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [params.id])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
