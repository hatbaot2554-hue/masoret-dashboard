import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const autoSubmitted = searchParams.get('auto_submitted')

    let query = 'SELECT * FROM orders'
    const params: any[] = []
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
    const body = await request.json()
    const {
      customer_name, customer_phone, customer_email, customer_address,
      items, total_price, cost_price, profit, payment_method,
      notes, source, utm_source
    } = body

    // יצירת טבלה אם לא קיימת (כולל עמודות חדשות)
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
    const body = await request.json()
    const { id, auto_submitted, checkout_url, external_order_id, status } = body

    if (!id) {
      return NextResponse.json({ error: 'חסר id' }, { status: 400 })
    }

    const updates: string[] = []
    const params: any[] = []

    if (auto_submitted !== undefined) {
      params.push(auto_submitted)
      updates.push(`auto_submitted = $${params.length}`)
    }
    if (checkout_url !== undefined) {
      params.push(checkout_url)
      updates.push(`checkout_url = $${params.length}`)
    }
    if (external_order_id !== undefined) {
      params.push(external_order_id)
      updates.push(`external_order_id = $${params.length}`)
    }
    if (status !== undefined) {
      params.push(status)
      updates.push(`status = $${params.length}`)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
    }

    params.push(id)
    const result = await pool.query(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )

    return NextResponse.json(result.rows[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
