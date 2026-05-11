import { Pool } from 'pg';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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

type OrderItem = {
  name?: string;
  sku?: string;
  sourceProductId?: string;
  sourceProductIndex?: number | string;
  productId?: string;
  variationId?: string;
  quantity?: number;
  price?: number;
  options?: string;
  engraving?: unknown;
};

type OrderRow = {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  items?: OrderItem[] | string | null;
  total_price?: number | string | null;
  notes?: string | null;
  status?: string | null;
  admin_notes?: unknown;
};

function parseItems(items: OrderRow['items']): OrderItem[] {
  if (Array.isArray(items)) return items;
  if (!items) return [];
  try {
    const parsed = JSON.parse(String(items));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

function publicOrderId(id: unknown): string {
  return String(id || '').replace(/\D/g, '').slice(-5).padStart(5, '0');
}

function validateOrder(row: OrderRow, items: OrderItem[]) {
  const missing: string[] = [];
  if (!String(row.customer_name || '').trim()) missing.push('שם לקוח');
  if (!String(row.customer_phone || '').trim()) missing.push('טלפון');
  if (!String(row.customer_email || '').trim()) missing.push('מייל');
  if (!String(row.customer_address || '').trim()) missing.push('כתובת');
  if (!items.length) missing.push('פריטי הזמנה');
  for (const [index, item] of items.entries()) {
    if (!String(item.sku || item.sourceProductId || item.productId || item.sourceProductIndex || '').trim()) {
      missing.push(`מזהה מוצר בפריט ${index + 1}`);
    }
    if (!Number(item.quantity || 0)) missing.push(`כמות בפריט ${index + 1}`);
  }
  return missing;
}

function buildSimulationPayload(row: OrderRow, items: OrderItem[]) {
  return {
    temporaryOrderId: publicOrderId(row.id),
    customer: {
      name: row.customer_name || '',
      phone: row.customer_phone || '',
      email: row.customer_email || '',
      address: row.customer_address || '',
    },
    items: items.map((item) => ({
      name: item.name || '',
      sku: item.sku || item.sourceProductId || item.productId || item.sourceProductIndex || '',
      variationId: item.variationId || '',
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
      options: item.options || '',
      engraving: item.engraving || null,
    })),
    total: Number(row.total_price || 0),
    customerNote: row.notes || '',
    mode: 'simulation_only',
  };
}

async function ensureColumns() {
  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS source_submit_payload JSONB,
    ADD COLUMN IF NOT EXISTS last_source_simulation_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS admin_notes JSONB DEFAULT '[]'::jsonb
  `);
}

async function simulateOne(row: OrderRow) {
  const items = parseItems(row.items);
  const missing = validateOrder(row, items);
  const payload = buildSimulationPayload(row, items);
  const nextStatus = missing.length ? 'needs_care' : 'source_submit_simulated';
  const note = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    author: 'מערכת',
    text: missing.length
      ? `סימולציית שליחה לאתר המקורי נכשלה. חסר: ${missing.join(', ')}`
      : 'סימולציית שליחה לאתר המקורי הושלמה בהצלחה. לא בוצעה שליחה אמיתית.',
    createdAt: new Date().toISOString(),
  };
  const notes = parseAdminNotes(row.admin_notes);
  const updated = await pool.query(
    `UPDATE orders
     SET status = $1,
         source_submit_payload = $2::jsonb,
         last_source_simulation_at = NOW(),
         admin_notes = $3::jsonb
     WHERE id = $4
     RETURNING *`,
    [nextStatus, JSON.stringify(payload), JSON.stringify([note, ...notes]), row.id]
  );
  return { order: updated.rows[0], payload, missing, ok: missing.length === 0 };
}

export async function POST(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }

    await ensureColumns();
    const body = await request.json().catch(() => ({})) as { id?: string };
    const params: string[] = [];
    let query = `SELECT * FROM orders WHERE status = 'ai_ready_for_source_submit' ORDER BY created_at ASC LIMIT 10`;

    if (body.id) {
      params.push(body.id);
      query = `SELECT * FROM orders WHERE id = $1 LIMIT 1`;
    }

    const result = await pool.query(query, params);
    const simulations = [];
    for (const row of result.rows) simulations.push(await simulateOne(row));

    return NextResponse.json({ simulations });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'שגיאה בסימולציית שליחה';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
