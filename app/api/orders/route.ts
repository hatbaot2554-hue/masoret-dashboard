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
  pending: 'ממתין לטיפול',
  confirmed: 'אושר',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל'
};

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
          status_he: statusLabels[order.status] || order.status || 'בטיפול'
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
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
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
    }

    const { id, auto_submitted, checkout_url, external_order_id, status } = body

    if (!id) {
      return NextResponse.json({ error: 'חסר id' }, { status: 400 })
    }

    const updates: string[] = []
    const values: (string | boolean)[] = []

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
