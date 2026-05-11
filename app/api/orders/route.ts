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

function publicOrderId(id: unknown): string {
  return String(id || '').replace(/\D/g, '').slice(-5).padStart(5, '0');
}

const statusLabels: Record<string, string> = {
  pending: 'ההזמנה התקבלה',
  needs_care: 'ההזמנה בבדיקה',
  ai_ready_for_source_submit: 'ההזמנה בעיבוד',
  source_submit_in_progress: 'ההזמנה בעיבוד',
  source_submit_simulated: 'ההזמנה בעיבוד',
  source_submitted: 'ההזמנה בטיפול',
  source_waiting_payment: 'ממתינים להשלמת תשלום',
  warehouse_processing: 'מכינים את ההזמנה',
  warehouse_backorder: 'ממתינים לזמינות המוצר',
  supplier_to_customer_warehouse: 'ההזמנה בהכנה למשלוח',
  confirmed: 'ההזמנה אושרה ונמצאת בטיפול',
  shipped: 'ההזמנה נשלחה',
  delivered: 'ההזמנה נמסרה',
  cancelled: 'ההזמנה בוטלה',
  source_sync_error: 'ההזמנה בבדיקה',
  not_paid: 'ממתינים להשלמת תשלום'
};

function customerStatusLabel(status: unknown): string {
  const key = String(status || 'pending');
  return statusLabels[key] || 'ההזמנה בטיפול';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const autoSubmitted = searchParams.get('auto_submitted')
    const orderNumber = searchParams.get('order')?.trim()
    const email = searchParams.get('email')?.trim().toLowerCase()

    if (orderNumber && email) {
      const result = await pool.query(
        `SELECT * FROM orders WHERE LOWER(customer_email) = LOWER($1) ORDER BY created_at DESC LIMIT 50`,
        [email]
      )
      const order = result.rows.find(row => publicOrderId(row.id) === orderNumber)
      if (!order) {
        return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
      }
      return NextResponse.json({
        order: {
          ...order,
          our_order_id: publicOrderId(order.id),
          date: new Date(order.created_at).toLocaleDateString('he-IL'),
          status_he: customerStatusLabel(order.status)
        }
      })
    }

    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
    }

    let query = 'SELECT * FROM orders'
    const params: string[] = []
    const conditions: string[] = []

    if (status) {
      params.push(status)
      conditions.push(`status = $${params.length}`)
    }

    if (autoSubmitted === 'false') {
      conditions.push(`(auto_submitted = FALSE OR auto_submitted IS NULL)`)
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY created_at DESC'

    const result = await pool.query(query, params)
    return NextResponse.json(result.rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      customer_name: string
      customer_phone: string
      customer_email: string
      customer_address: string
      items: unknown
      total_price: number
      cost_price: number
      profit: number
      payment_method: string
      notes: string
      source: string
      utm_source: string
    }

    const {
      customer_name, customer_phone, customer_email, customer_address,
      items, total_price, cost_price, profit, payment_method,
      notes, source, utm_source
    } = body

    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS checkout_url TEXT,
      ADD COLUMN IF NOT EXISTS external_order_id TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS admin_notes JSONB DEFAULT '[]'::jsonb
    `).catch(() => {})

    const result = await pool.query(
      `INSERT INTO orders (
        customer_name, customer_phone, customer_email, customer_address,
        items, total_price, cost_price, profit, payment_method,
        notes, source, utm_source, auto_submitted, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        customer_name, customer_phone, customer_email, customer_address,
        JSON.stringify(items), total_price, cost_price || 0, profit || 0,
        payment_method, notes, source || 'direct', utm_source || '',
        false, 'pending'
      ]
    )
    return NextResponse.json(result.rows[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
    }

    const body = await request.json() as {
      id: string
      auto_submitted?: boolean
      checkout_url?: string
      external_order_id?: string
      status?: string
      admin_notes?: unknown
    }

    const { id, auto_submitted, checkout_url, external_order_id, status, admin_notes } = body

    if (!id) {
      return NextResponse.json({ error: 'חסר id' }, { status: 400 })
    }

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

    return NextResponse.json(result.rows[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
