import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const body = await request.json() as {
      auto_submitted?: boolean
      checkout_url?: string
      external_order_id?: string
      status?: string
    }

    const { auto_submitted, checkout_url, external_order_id, status } = body

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

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
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
