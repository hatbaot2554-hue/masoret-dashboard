import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    return NextResponse.json(result.rows);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer_name, customer_phone, customer_email, customer_address, items, total_price, cost_price, profit, payment_method, notes, source, utm_source } = body;
    const result = await pool.query(
      `INSERT INTO orders (customer_name, customer_phone, customer_email, customer_address, items, total_price, cost_price, profit, payment_method, notes, source, utm_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [customer_name, customer_phone, customer_email, customer_address, JSON.stringify(items), total_price, cost_price || 0, profit || 0, payment_method, notes, source || 'direct', utm_source || '']
    );
    return NextResponse.json(result.rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'שגיאה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
