import { NextResponse } from 'next/server'
import { createDbPool } from '../../../lib/db'

const pool = createDbPool()

export async function POST(req: Request) {
  const { ids } = await req.json()
  if (!ids || !ids.length) {
    return NextResponse.json({ ok: true })
  }
  try {
    await pool.query(
      `UPDATE waitlist SET notified = TRUE WHERE id = ANY($1::int[])`,
      [ids]
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 })
  }
}
