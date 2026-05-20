import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';
import {
  clientIp,
  genericServerError,
  getDashboardAuthSecret,
  rateLimit,
  safeEqual,
  signDashboardPayload,
} from '../../lib/security';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

function legacyHashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(password, salt, 64).toString('base64url');
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash?.startsWith('scrypt$')) {
    const [, n, r, p, salt, hash] = storedHash.split('$');
    if (!n || !r || !p || !salt || !hash) return false;
    const nextHash = crypto.scryptSync(password, salt, 64, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    }).toString('base64url');
    return safeEqual(nextHash, hash);
  }
  return safeEqual(storedHash || '', legacyHashPassword(password));
}

function passwordNeedsUpgrade(storedHash: string): boolean {
  return !storedHash?.startsWith('scrypt$');
}

function strongPassword(password: string): boolean {
  return password.length >= 10 && /[A-Za-zא-ת]/.test(password) && /\d/.test(password);
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(user: { id: number; username: string; role: string }): string {
  const payload = base64UrlJson({
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  });
  return `${payload}.${signDashboardPayload(payload)}`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY לא מוגדר' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'מסורת <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      return { success: false, error: `Resend error: ${res.status}` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'שגיאה בשליחת מייל' };
  }
}

function emailTemplatePasswordReset(code: string, fullName: string): string {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 32px; text-align: center;">
        <h1 style="color: #F59E0B; margin: 0 0 16px;">איפוס סיסמה</h1>
        <p style="color: #4B5563; font-size: 16px;">שלום ${fullName || ''},</p>
        <p style="color: #4B5563; font-size: 14px;">קיבלנו בקשה לאפס את הסיסמה שלך ללוח הבקרה של מסורת.</p>
        <p style="color: #4B5563; font-size: 14px; margin-top: 24px;">קוד האיפוס שלך:</p>
        <div style="background: #F59E0B; color: white; font-size: 32px; font-weight: bold; padding: 16px; border-radius: 8px; letter-spacing: 8px; margin: 16px 0;">${code}</div>
        <p style="color: #6B7280; font-size: 13px;">הקוד תקף ל-15 דקות.</p>
        <p style="color: #6B7280; font-size: 13px; margin-top: 24px;">אם לא ביקשת איפוס סיסמה, התעלם ממייל זה.</p>
      </div>
    </div>
  `;
}

function emailTemplateUsername(username: string, fullName: string): string {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 32px; text-align: center;">
        <h1 style="color: #F59E0B; margin: 0 0 16px;">שם המשתמש שלך</h1>
        <p style="color: #4B5563; font-size: 16px;">שלום ${fullName || ''},</p>
        <p style="color: #4B5563; font-size: 14px;">ביקשת לקבל את שם המשתמש שלך ללוח הבקרה של מסורת.</p>
        <p style="color: #4B5563; font-size: 14px; margin-top: 24px;">שם המשתמש שלך:</p>
        <div style="background: #1E3A8A; color: white; font-size: 24px; font-weight: bold; padding: 16px; border-radius: 8px; margin: 16px 0;">${username}</div>
        <p style="color: #6B7280; font-size: 13px; margin-top: 24px;">אם לא ביקשת זאת, התעלם ממייל זה.</p>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  try {
    getDashboardAuthSecret();
    const body = await request.json();
    const { action } = body;
    const ip = clientIp(request);

    if (action === 'login') {
      const { username, password } = body;
      if (!rateLimit(`login:${ip}:${String(username || '').toLowerCase()}`, 6, 10 * 60 * 1000)) {
        return NextResponse.json({ success: false, error: 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.' }, { status: 429 });
      }
      if (!username || !password) {
        return NextResponse.json({ success: false, error: 'יש להזין שם משתמש וסיסמה' }, { status: 400 });
      }

      const result = await pool.query(
        `SELECT id, username, password_hash, email, full_name, role, is_active FROM users WHERE LOWER(username) = LOWER($1)`,
        [username]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'שם משתמש או סיסמה שגויים' }, { status: 401 });
      }

      const user = result.rows[0];
      if (!user.is_active) {
        return NextResponse.json({ success: false, error: 'החשבון מושבת. פנה למנהל.' }, { status: 403 });
      }
      if (!verifyPassword(password, user.password_hash)) {
        return NextResponse.json({ success: false, error: 'שם משתמש או סיסמה שגויים' }, { status: 401 });
      }
      if (passwordNeedsUpgrade(user.password_hash)) {
        await pool.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [hashPassword(password), user.id]
        ).catch(() => {});
      }

      const token = createToken({ id: user.id, username: user.username, role: user.role });
      return NextResponse.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
        },
      });
    }

    if (action === 'forgot_password_send_code') {
      const { email } = body;
      if (!email) {
        return NextResponse.json({ success: false, error: 'יש להזין מייל' }, { status: 400 });
      }
      if (!rateLimit(`forgot:${ip}:${String(email).toLowerCase()}`, 5, 15 * 60 * 1000)) {
        return NextResponse.json({ success: true, message: 'אם המייל רשום במערכת, יישלח אליו קוד איפוס.' });
      }

      const result = await pool.query(
        `SELECT id, full_name FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
        [email]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ success: true, message: 'אם המייל רשום במערכת, יישלח אליו קוד איפוס.' });
      }

      const user = result.rows[0];
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await pool.query(
        `INSERT INTO reset_codes (email, code, type, expires_at) VALUES ($1, $2, 'password', $3)`,
        [email.toLowerCase(), code, expiresAt]
      );

      const emailRes = await sendEmail(
        email,
        'קוד איפוס סיסמה - מסורת',
        emailTemplatePasswordReset(code, user.full_name)
      );
      if (!emailRes.success) {
        console.error('Email error:', emailRes.error);
        return NextResponse.json({ success: false, error: 'שגיאה בשליחת המייל. נסה שוב מאוחר יותר.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'אם המייל רשום במערכת, יישלח אליו קוד איפוס.' });
    }

    if (action === 'forgot_password_verify') {
      const { email, code, newPassword } = body;
      if (!email || !code || !newPassword) {
        return NextResponse.json({ success: false, error: 'חסרים פרטים' }, { status: 400 });
      }
      if (!strongPassword(newPassword)) {
        return NextResponse.json({ success: false, error: 'הסיסמה חייבת להיות לפחות 10 תווים ולכלול אות ומספר.' }, { status: 400 });
      }

      const codeRes = await pool.query(
        `SELECT id FROM reset_codes
         WHERE LOWER(email) = LOWER($1) AND code = $2 AND type = 'password'
         AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email, code]
      );
      if (codeRes.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'קוד לא תקין או פג תוקף' }, { status: 401 });
      }

      await pool.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2)`,
        [hashPassword(newPassword), email]
      );
      await pool.query(`UPDATE reset_codes SET used = TRUE WHERE id = $1`, [codeRes.rows[0].id]);
      return NextResponse.json({ success: true, message: 'הסיסמה אופסה בהצלחה' });
    }

    if (action === 'forgot_username') {
      const { email } = body;
      if (!email) {
        return NextResponse.json({ success: false, error: 'יש להזין מייל' }, { status: 400 });
      }
      if (!rateLimit(`username:${ip}:${String(email).toLowerCase()}`, 5, 15 * 60 * 1000)) {
        return NextResponse.json({ success: true, message: 'אם המייל רשום במערכת, שם המשתמש יישלח אליו.' });
      }

      const result = await pool.query(
        `SELECT username, full_name FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
        [email]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ success: true, message: 'אם המייל רשום במערכת, שם המשתמש יישלח אליו.' });
      }

      const user = result.rows[0];
      const emailRes = await sendEmail(
        email,
        'שם המשתמש שלך - מסורת',
        emailTemplateUsername(user.username, user.full_name)
      );
      if (!emailRes.success) {
        console.error('Email error:', emailRes.error);
        return NextResponse.json({ success: false, error: 'שגיאה בשליחת המייל. נסה שוב מאוחר יותר.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'אם המייל רשום במערכת, שם המשתמש יישלח אליו.' });
    }

    if (action === 'change_password') {
      const { username, currentPassword, newPassword } = body;
      if (!username || !currentPassword || !newPassword) {
        return NextResponse.json({ success: false, error: 'חסרים פרטים' }, { status: 400 });
      }
      if (!strongPassword(newPassword)) {
        return NextResponse.json({ success: false, error: 'הסיסמה חייבת להיות לפחות 10 תווים ולכלול אות ומספר.' }, { status: 400 });
      }

      const result = await pool.query(
        `SELECT password_hash FROM users WHERE LOWER(username) = LOWER($1) AND is_active = TRUE`,
        [username]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'משתמש לא נמצא' }, { status: 404 });
      }
      if (!verifyPassword(currentPassword, result.rows[0].password_hash)) {
        return NextResponse.json({ success: false, error: 'הסיסמה הנוכחית שגויה' }, { status: 401 });
      }

      await pool.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE LOWER(username) = LOWER($2)`,
        [hashPassword(newPassword), username]
      );
      return NextResponse.json({ success: true, message: 'הסיסמה שונתה בהצלחה' });
    }

    return NextResponse.json({ success: false, error: 'פעולה לא חוקית' }, { status: 400 });
  } catch (error) {
    return genericServerError(error);
  }
}
