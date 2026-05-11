import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const READY_STATUS = 'ai_ready_for_source_submit';
const IN_PROGRESS_STATUS = 'source_submit_in_progress';
const SIMULATED_STATUS = 'source_submit_simulated';
const FAILED_STATUS = 'needs_care';

function automationSecret(): string {
  return process.env.AUTOMATION_API_SECRET ||
    process.env.DASHBOARD_AUTH_SECRET ||
    process.env.DATABASE_URL ||
    '';
}

function isAutomationRequest(request: Request): boolean {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return Boolean(token && automationSecret() && token === automationSecret());
}

function appendNote(existing: unknown, text: string) {
  let notes: unknown[] = [];
  if (Array.isArray(existing)) {
    notes = existing;
  } else if (typeof existing === 'string' && existing.trim()) {
    try {
      const parsed = JSON.parse(existing);
      notes = Array.isArray(parsed) ? parsed : [];
    } catch {
      notes = [];
    }
  }

  return [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      author: 'אוטומציית הזמנות',
      text,
      createdAt: new Date().toISOString()
    },
    ...notes
  ];
}

function isAllowedStatus(status: string): boolean {
  return [
    READY_STATUS,
    IN_PROGRESS_STATUS,
    SIMULATED_STATUS,
    FAILED_STATUS,
    'confirmed',
    'cancelled'
  ].includes(status);
}

export async function GET(request: Request) {
  try {
    if (!isAutomationRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }

    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS checkout_url TEXT,
      ADD COLUMN IF NOT EXISTS external_order_id TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS admin_notes JSONB DEFAULT '[]'::jsonb
    `).catch(() => {});

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 10), 1), 50);

    const result = await pool.query(
      `SELECT *
       FROM orders
       WHERE status = $1
         AND (auto_submitted = FALSE OR auto_submitted IS NULL)
         AND (source = 'ai_chat_safe' OR COALESCE(notes, '') LIKE '%AI_CHAT_SAFE_ORDER%')
       ORDER BY created_at ASC
       LIMIT $2`,
      [READY_STATUS, limit]
    );

    return NextResponse.json({
      orders: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isAutomationRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }

    const body = await request.json() as {
      id?: string;
      status?: string;
      external_order_id?: string;
      checkout_url?: string;
      note?: string;
      auto_submitted?: boolean;
    };

    if (!body.id) {
      return NextResponse.json({ error: 'חסר id' }, { status: 400 });
    }

    const nextStatus = body.status || IN_PROGRESS_STATUS;
    if (!isAllowedStatus(nextStatus)) {
      return NextResponse.json({ error: 'סטטוס לא מורשה' }, { status: 400 });
    }

    const current = await pool.query(`SELECT admin_notes FROM orders WHERE id = $1`, [body.id]);
    if (current.rows.length === 0) {
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
    }

    const noteText = body.note ||
      (nextStatus === IN_PROGRESS_STATUS
        ? 'האוטומציה התחילה לטפל בהזמנה.'
        : `האוטומציה עדכנה סטטוס ל-${nextStatus}.`);

    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           external_order_id = COALESCE($2, external_order_id),
           checkout_url = COALESCE($3, checkout_url),
           auto_submitted = COALESCE($4, auto_submitted),
           admin_notes = $5::jsonb
       WHERE id = $6
       RETURNING *`,
      [
        nextStatus,
        body.external_order_id || null,
        body.checkout_url || null,
        typeof body.auto_submitted === 'boolean' ? body.auto_submitted : null,
        JSON.stringify(appendNote(current.rows[0].admin_notes, noteText)),
        body.id
      ]
    );

    return NextResponse.json({ order: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

