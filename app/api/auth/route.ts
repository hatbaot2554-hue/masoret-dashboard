import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function ensureAuthTableInitialized() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard_auth (
        id SERIAL PRIMARY KEY,
        key_name VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const existing = await client.query(
      `SELECT key_name FROM dashboard_auth WHERE key_name = 'dashboard'`
    );

    if (existing.rows.length === 0) {
      const defaultPassword = process.env.DEFAULT_DASHBOARD_PASSWORD || 'Masoret2025';
      await client.query(
        `INSERT INTO dashboard_auth (key_name, password_hash) VALUES ($1, $2)`,
        ['dashboard', hashPassword(defaultPassword)]
      );
    }
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  try {
    await ensureAuthTableInitialized();

    const body = await request.json();
    const { action, password, adminPassword, newPassword } = body;

    // Login action
    if (action === 'login') {
      if (!password) {
        return NextResponse.json({ success: false, error: 'יש להזין סיסמה' }, { status: 400 });
      }

      const result = await pool.query(
        `SELECT password_hash FROM dashboard_auth WHERE key_name = 'dashboard'`
      );

      if (result.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'לא נמצאה סיסמה במערכת' }, { status: 401 });
      }

      const isValid = result.rows[0].password_hash === hashPassword(password);

      if (!isValid) {
        return NextResponse.json({ success: false, error: 'סיסמה שגויה' }, { status: 401 });
      }

      const token = crypto.randomBytes(32).toString('hex');
      return NextResponse.json({ success: true, token });
    }

    // Change password action — requires admin password
    if (action === 'change_password') {
      if (!process.env.ADMIN_PASSWORD) {
        return NextResponse.json(
          { success: false, error: 'ADMIN_PASSWORD לא מוגדר במערכת' },
          { status: 500 }
        );
      }

      if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json(
          { success: false, error: 'סיסמת מנהל שגויה' },
          { status: 403 }
        );
      }

      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json(
          { success: false, error: 'הסיסמה חייבת להיות לפחות 6 תווים' },
          { status: 400 }
        );
      }

      await pool.query(
        `UPDATE dashboard_auth 
         SET password_hash = $1, updated_at = NOW() 
         WHERE key_name = 'dashboard'`,
        [hashPassword(newPassword)]
      );

      return NextResponse.json({ success: true, message: 'הסיסמה שונתה בהצלחה' });
    }

    // Recover info — requires admin password
    if (action === 'get_current_password_for_admin') {
      if (!process.env.ADMIN_PASSWORD) {
        return NextResponse.json(
          { success: false, error: 'ADMIN_PASSWORD לא מוגדר במערכת' },
          { status: 500 }
        );
      }

      if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json(
          { success: false, error: 'סיסמת מנהל שגויה' },
          { status: 403 }
        );
      }

      const defaultPassword = process.env.DEFAULT_DASHBOARD_PASSWORD || 'Masoret2025';
      const result = await pool.query(
        `SELECT updated_at FROM dashboard_auth WHERE key_name = 'dashboard'`
      );

      const updatedAt = result.rows[0]?.updated_at;
      const wasChanged = updatedAt && (new Date().getTime() - new Date(updatedAt).getTime()) > 60000;

      return NextResponse.json({
        success: true,
        message: wasChanged
          ? 'הסיסמה שונתה בעבר ומאוחסנת מוצפנת ב-DB. לא ניתן לשחזר אותה — מטעמי אבטחה היא שמורה רק כ-hash.'
          : `סיסמת ברירת המחדל היא: ${defaultPassword}`,
        hint: wasChanged
          ? 'כדי להגדיר סיסמה חדשה, חזור למסך הקודם ולחץ "שינוי סיסמה" — שם תוכל להגדיר סיסמה חדשה באמצעות סיסמת המנהל.'
          : 'התחבר עם הסיסמה הזו ואז שנה אותה במסך לוח הבקרה.'
      });
    }

    return NextResponse.json({ success: false, error: 'פעולה לא חוקית' }, { status: 400 });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'שגיאה לא ידועה';
    console.error('Auth error:', msg);
    return NextResponse.json(
      { success: false, error: 'שגיאת שרת: ' + msg },
      { status: 500 }
    );
  }
}
