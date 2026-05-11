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

type OrderRow = {
  id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  items?: unknown;
  admin_notes?: unknown;
};

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

function parseItems(items: unknown): unknown[] {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string' && items.trim()) {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function publicOrderId(id: unknown): string {
  return String(id || '').replace(/\D/g, '').slice(-5).padStart(5, '0');
}

function missingSimulationFields(order: OrderRow): string[] {
  const missing: string[] = [];
  if (!String(order.customer_name || '').trim()) missing.push('שם לקוח');
  if (!String(order.customer_phone || '').trim()) missing.push('טלפון');
  if (!String(order.customer_email || '').trim()) missing.push('מייל');
  if (!String(order.customer_address || '').trim()) missing.push('כתובת');

  const items = parseItems(order.items);
  if (!items.length) {
    missing.push('מוצרים');
  } else {
    const hasBadItem = items.some((item) => {
      if (!item || typeof item !== 'object') return true;
      const record = item as Record<string, unknown>;
      return !String(record.name || record.sku || record.sourceProductId || '').trim() ||
        Number(record.quantity || 1) < 1;
    });
    if (hasBadItem) missing.push('פרטי מוצר מלאים');
  }

  return missing;
}

async function readyOrders(limit: number) {
  return pool.query<OrderRow>(
    `SELECT *
     FROM orders
     WHERE status = $1
       AND (auto_submitted = FALSE OR auto_submitted IS NULL)
       AND (source = 'ai_chat_safe' OR COALESCE(notes, '') LIKE '%AI_CHAT_SAFE_ORDER%')
     ORDER BY created_at ASC
     LIMIT $2`,
    [READY_STATUS, limit]
  );
}

async function updateAutomationStatus(
  order: OrderRow,
  status: string,
  note: string,
  extra: { externalOrderId?: string; autoSubmitted?: boolean } = {}
) {
  const result = await pool.query(
    `UPDATE orders
     SET status = $1,
         external_order_id = COALESCE($2, external_order_id),
         auto_submitted = COALESCE($3, auto_submitted),
         admin_notes = $4::jsonb
     WHERE id = $5
     RETURNING *`,
    [
      status,
      extra.externalOrderId || null,
      typeof extra.autoSubmitted === 'boolean' ? extra.autoSubmitted : null,
      JSON.stringify(appendNote(order.admin_notes, note)),
      order.id
    ]
  );

  return result.rows[0];
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

    const result = await readyOrders(limit);

    return NextResponse.json({
      orders: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => ({})) as { limit?: number };
    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 25);
    const result = await readyOrders(limit);
    const processed = [];

    for (const order of result.rows) {
      const missing = missingSimulationFields(order);
      if (missing.length) {
        const updated = await updateAutomationStatus(
          order,
          FAILED_STATUS,
          `סימולציית שליחה נכשלה: חסרים ${missing.join(', ')}.`
        );
        processed.push({
          id: order.id,
          publicOrderId: publicOrderId(order.id),
          ok: false,
          status: FAILED_STATUS,
          missing,
          order: updated
        });
        continue;
      }

      const simulationId = `SIM-${publicOrderId(order.id)}-${Date.now().toString().slice(-6)}`;
      const updated = await updateAutomationStatus(
        order,
        SIMULATED_STATUS,
        `סימולציית שליחה עברה בהצלחה. מזהה סימולציה: ${simulationId}. לא בוצעה הזמנה באתר חיצוני.`,
        { externalOrderId: simulationId, autoSubmitted: false }
      );

      processed.push({
        id: order.id,
        publicOrderId: publicOrderId(order.id),
        ok: true,
        status: SIMULATED_STATUS,
        simulationId,
        order: updated
      });
    }

    return NextResponse.json({
      simulated: true,
      count: processed.length,
      processed
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

