import { NextResponse } from 'next/server';
import { createDbPool } from '../../lib/db';
import { clientIp, genericServerError, isDashboardRequest, rateLimit, sharedSecretAllowed } from '../../lib/security';

const pool = createDbPool();

function publicOrderId(id: unknown): string {
  return String(id || '').replace(/\D/g, '').slice(-5).padStart(5, '0');
}

const statusLabels: Record<string, string> = {
  pending: 'הזמנה בתהליך',
  needs_care: 'הזמנה בתהליך',
  ai_draft: 'הזמנה בתהליך',
  ai_ready_for_source_submit: 'הזמנה בעיבוד',
  source_submit_in_progress: 'הזמנה בעיבוד',
  source_submit_simulated: 'הזמנה בעיבוד',
  warehouse_processing: 'הזמנה בעיבוד',
  warehouse_backorder: 'הזמנה בעיבוד',
  supplier_to_customer_warehouse: 'הזמנה בעיבוד',
  confirmed: 'הזמנה בעיבוד',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל'
};

function publicOrder(row: Record<string, unknown>) {
  const status = String(row.status || 'pending');
  return {
    ...row,
    our_order_id: publicOrderId(row.id),
    date: new Date(String(row.created_at)).toLocaleDateString('he-IL'),
    status_he: statusLabels[status] || 'הזמנה בתהליך',
    customer_status: statusLabels[status] || 'הזמנה בתהליך',
  };
}

async function ensureOrdersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      customer_address TEXT,
      items JSONB DEFAULT '[]'::jsonb,
      total_price NUMERIC DEFAULT 0,
      cost_price NUMERIC DEFAULT 0,
      profit NUMERIC DEFAULT 0,
      payment_method TEXT DEFAULT 'pending',
      notes TEXT,
      source TEXT DEFAULT 'direct',
      utm_source TEXT,
      auto_submitted BOOLEAN DEFAULT FALSE,
      checkout_url TEXT,
      external_order_id TEXT,
      status TEXT DEFAULT 'pending',
      admin_notes JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS customer_phone TEXT,
    ADD COLUMN IF NOT EXISTS customer_email TEXT,
    ADD COLUMN IF NOT EXISTS customer_address TEXT,
    ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS profit NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct',
    ADD COLUMN IF NOT EXISTS utm_source TEXT,
    ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS checkout_url TEXT,
    ADD COLUMN IF NOT EXISTS external_order_id TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS admin_notes JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const autoSubmitted = searchParams.get('auto_submitted')
    const orderNumber = searchParams.get('order')?.trim()
    const email = searchParams.get('email')?.trim().toLowerCase()
    const account = searchParams.get('account')?.trim()

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
        order: publicOrder(order)
      })
    }

    if (account) {
      if (!rateLimit(`account-orders:${clientIp(request)}:${account.toLowerCase()}`, 20, 10 * 60 * 1000)) {
        return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב בעוד כמה דקות.' }, { status: 429 })
      }
      const isEmail = account.includes('@')
      const normalizedPhone = account.replace(/\D/g, '')
      const result = isEmail
        ? await pool.query(
            `SELECT * FROM orders WHERE LOWER(customer_email) = LOWER($1) ORDER BY created_at DESC LIMIT 100`,
            [account]
          )
        : await pool.query(
            `SELECT * FROM orders WHERE regexp_replace(COALESCE(customer_phone, ''), '\\D', '', 'g') = $1 ORDER BY created_at DESC LIMIT 100`,
            [normalizedPhone]
          )

      return NextResponse.json({ orders: result.rows.map(publicOrder) })
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
    if (sharedSecretAllowed(request, 'DASHBOARD_ORDERS_API_SECRET', 'x-dashboard-orders-secret')) {
      const error = e as { code?: string; name?: string; message?: string }
      return NextResponse.json({
        error: 'שגיאת שרת. נסה שוב מאוחר יותר.',
        internal_code: error.code || error.name || 'UNKNOWN',
        internal_message: error.message || 'Unknown order lookup error',
      }, { status: 500 })
    }
    return genericServerError(e)
  }
}

export async function POST(request: Request) {
  try {
    if (!sharedSecretAllowed(request, 'DASHBOARD_ORDERS_API_SECRET', 'x-dashboard-orders-secret')) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
    }
    if (!rateLimit(`create-order:${clientIp(request)}`, 40, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב בעוד כמה דקות.' }, { status: 429 })
    }
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

    await ensureOrdersTable().catch((error) => {
      console.error('Could not ensure orders table before insert', error)
    })

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
    return genericServerError(e)
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
    return genericServerError(e)
  }
}
