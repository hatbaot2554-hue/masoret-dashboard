import { NextResponse } from 'next/server';
import { createDbPool } from '../../lib/db';
import { sharedSecretAllowed, genericServerError, rateLimit, clientIp } from '../../lib/security';
const pool = createDbPool();
async function ensureTable() {
  await pool.query('CREATE TABLE IF NOT EXISTS waitlist (id SERIAL PRIMARY KEY, email TEXT NOT NULL, product_index INTEGER NOT NULL, product_name TEXT, notified BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())');
}
export async function GET(request: Request) {
  if (!sharedSecretAllowed(request, 'DASHBOARD_ORDERS_API_SECRET', 'x-dashboard-orders-secret')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureTable();
    const result = await pool.query('SELECT id, email, product_index AS "productIndex", product_name AS "productName" FROM waitlist WHERE notified=FALSE ORDER BY id');
    return NextResponse.json(result.rows);
  } catch (error) { return genericServerError(error); }
}
export async function POST(request: Request) {
  try {
    if (!rateLimit(`waitlist:${clientIp(request)}`, 10, 600000)) return NextResponse.json({ error: 'נסה שוב מאוחר יותר' }, { status: 429 });
    const { email, productIndex, productName } = await request.json();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '')) || !Number.isInteger(productIndex) || productIndex < 0) return NextResponse.json({ error: 'פרטים לא תקינים' }, { status: 400 });
    await ensureTable();
    await pool.query('INSERT INTO waitlist(email,product_index,product_name) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM waitlist WHERE email=$1 AND product_index=$2 AND notified=FALSE)', [email.trim().toLowerCase(), productIndex, String(productName || '').slice(0,500)]);
    return NextResponse.json({ ok: true });
  } catch (error) { return genericServerError(error); }
}
