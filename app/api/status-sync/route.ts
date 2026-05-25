import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { nextLocalOrderStatus, statusSyncNote } from '../../lib/order-status';
import { createDbPool } from '../../lib/db';

const pool = createDbPool();

function getAuthSecret(): string {
  return process.env.DASHBOARD_AUTH_SECRET?.trim() || '';
}

function sign(value: string): string {
  return crypto.createHmac('sha256', getAuthSecret()).update(value).digest('base64url');
}

function isDashboardRequest(request: Request): boolean {
  if (!getAuthSecret()) return false;
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

type OrderRow = {
  id: string;
  status?: string | null;
  auto_submitted?: boolean | null;
  external_order_id?: string | null;
  checkout_url?: string | null;
  source_status?: string | null;
  admin_notes?: unknown;
};

function parseAdminNotes(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function ensureColumns() {
  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS source_status TEXT,
    ADD COLUMN IF NOT EXISTS last_status_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS admin_notes JSONB DEFAULT '[]'::jsonb
  `);
}

async function syncOrder(row: OrderRow, explicitSourceStatus?: string | null) {
  const sourceStatus = explicitSourceStatus ?? row.source_status ?? null;
  const nextStatus = nextLocalOrderStatus({
    currentStatus: row.status,
    autoSubmitted: row.auto_submitted,
    externalOrderId: row.external_order_id,
    checkoutUrl: row.checkout_url,
    sourceStatus,
  });
  const notes = parseAdminNotes(row.admin_notes);
  const syncLog = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    author: 'מערכת',
    text: statusSyncNote(nextStatus, sourceStatus),
    createdAt: new Date().toISOString(),
  };

  const result = await pool.query(
    `UPDATE orders
     SET status = $1,
         source_status = COALESCE($2, source_status),
         last_status_sync_at = NOW(),
         admin_notes = $3::jsonb
     WHERE id = $4
     RETURNING *`,
    [nextStatus, sourceStatus, JSON.stringify([syncLog, ...notes]), row.id]
  );

  return result.rows[0];
}

export async function POST(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }

    await ensureColumns();
    const body = await request.json().catch(() => ({})) as { id?: string; source_status?: string };

    if (body.id) {
      const result = await pool.query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [body.id]);
      if (!result.rowCount) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
      const updated = await syncOrder(result.rows[0], body.source_status || null);
      return NextResponse.json({ updated: [updated] });
    }

    const result = await pool.query(`
      SELECT * FROM orders
      WHERE status IN ('ai_ready_for_source_submit', 'source_submit_in_progress', 'source_submitted', 'source_waiting_payment')
      ORDER BY created_at ASC
      LIMIT 25
    `);
    const updated = [];
    for (const row of result.rows) updated.push(await syncOrder(row));
    return NextResponse.json({ updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'שגיאה בסנכרון סטטוס';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
