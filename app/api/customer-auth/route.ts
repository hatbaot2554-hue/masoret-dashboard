import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createDbPool } from '../../lib/db';
import { sendSystemEmail } from '../../lib/email';
import { signDashboardPayload, rateLimit, clientIp, genericServerError } from '../../lib/security';
const pool = createDbPool();
export async function POST(request: Request) {
  try {
    const { identifier, code } = await request.json();
    const email = String(identifier || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'יש להזין מייל תקין' }, { status: 400 });
    if (!rateLimit(`customer-auth:${clientIp(request)}`, 10, 600000)) return NextResponse.json({ error: 'נסה שוב מאוחר יותר' }, { status: 429 });
    await pool.query('CREATE TABLE IF NOT EXISTS customer_login_codes (email TEXT PRIMARY KEY, digest TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)');
    if (!code) {
      const otp = String(crypto.randomInt(100000, 1000000));
      const digest = signDashboardPayload(`otp:${email}:${otp}`);
      const inserted = await pool.query("INSERT INTO customer_login_codes(email,digest,expires) VALUES($1,$2,NOW()+INTERVAL '10 minutes') ON CONFLICT(email) DO UPDATE SET digest=$2, expires=NOW()+INTERVAL '10 minutes', attempts=0 WHERE customer_login_codes.expires < NOW() RETURNING email", [email, digest]);
      if (!inserted.rowCount) return NextResponse.json({ challenge: true });
      const sent = await sendSystemEmail([email], 'קוד כניסה למסורת', `<div dir="rtl">קוד הכניסה שלך: <strong>${otp}</strong>. תקף לעשר דקות.</div>`);
      if (!sent.success) {
        await pool.query('DELETE FROM customer_login_codes WHERE email=$1 AND digest=$2', [email, digest]);
        return NextResponse.json({ error: 'שליחת הקוד נכשלה' }, { status: 503 });
      }
      return NextResponse.json({ challenge: true });
    }
    const attempt = await pool.query('UPDATE customer_login_codes SET attempts=attempts+1 WHERE email=$1 AND expires>NOW() AND attempts<5 RETURNING digest', [email]);
    const digest = signDashboardPayload(`otp:${email}:${String(code)}`);
    if (!attempt.rows[0] || attempt.rows[0].digest !== digest) return NextResponse.json({ error: 'קוד שגוי או שפג תוקפו' }, { status: 401 });
    const consumed = await pool.query('DELETE FROM customer_login_codes WHERE email=$1 AND digest=$2 RETURNING email', [email, digest]);
    if (!consumed.rowCount) return NextResponse.json({ error: 'הקוד כבר נוצל' }, { status: 401 });
    const payload = Buffer.from(JSON.stringify({ purpose: 'customer', identifier: email, exp: Date.now() + 86400000 })).toString('base64url');
    return NextResponse.json({ token: `${payload}.${signDashboardPayload(payload)}` });
  } catch (error) { return genericServerError(error); }
}
