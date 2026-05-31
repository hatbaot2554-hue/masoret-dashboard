import { Pool } from "pg";
import { sendSystemEmail } from "./email";

type OrderEmailRow = {
  id: string | number;
  customer_name?: string | null;
  customer_email?: string | null;
  external_order_id?: string | null;
};

function siteUrl(): string {
  return (process.env.SITE_URL || process.env.WEBSITE_URL || "https://masoret-website.vercel.app").replace(/\/$/, "");
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function ensureOrderEmailColumns(pool: Pool) {
  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS external_order_email_sent_at TIMESTAMPTZ
  `);
}

export async function sendExternalOrderReadyEmail(pool: Pool, order: OrderEmailRow) {
  await ensureOrderEmailColumns(pool);

  const externalOrderId = String(order.external_order_id || "").trim();
  const email = String(order.customer_email || "").trim().toLowerCase();
  if (!externalOrderId || !email || externalOrderId.toUpperCase().startsWith("SIM-")) {
    return { sent: false, reason: "not_ready" };
  }

  const state = await pool.query(
    `SELECT external_order_email_sent_at FROM orders WHERE id = $1`,
    [order.id]
  );
  if (state.rows[0]?.external_order_email_sent_at) {
    return { sent: false, reason: "already_sent" };
  }

  const trackingUrl = `${siteUrl()}/track?order=${encodeURIComponent(externalOrderId)}&email=${encodeURIComponent(email)}`;
  const customerName = escapeHtml(order.customer_name || "לקוח יקר");
  const safeOrderId = escapeHtml(externalOrderId);
  const html = `
    <div dir="rtl" style="margin:0;background:#f6f8fb;padding:28px 12px;font-family:Arial,'Heebo',sans-serif;color:#14213d">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e6eaf0;border-radius:14px;overflow:hidden">
        <div style="background:#eef4fb;padding:26px 28px">
          <div style="font-size:14px;color:#53657a;margin-bottom:8px">המרכז למסורת יהודית</div>
          <h1 style="margin:0 0 18px;font-size:30px;line-height:1.25;color:#061f3f">ההזמנה נפתחה</h1>
          <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
            <div>
              <div style="font-size:13px;color:#53657a;margin-bottom:4px">מספר הזמנה</div>
              <div style="font-size:22px;font-weight:700;color:#061f3f">${safeOrderId}</div>
            </div>
            <a href="${trackingUrl}" style="display:inline-block;background:#00689d;color:#fff;text-decoration:none;border-radius:999px;padding:13px 24px;font-size:16px;font-weight:700">מעקב אחר ההזמנה</a>
          </div>
        </div>
        <div style="padding:26px 28px;line-height:1.8;font-size:16px">
          <p style="margin:0 0 12px">שלום ${customerName},</p>
          <p style="margin:0 0 12px">מספר ההזמנה הרשמי שלך מוכן. אפשר ללחוץ על הכפתור למעקב אחר ההזמנה באתר.</p>
          <p style="margin:0;color:#53657a">החשבונית תישלח לפי מערכת החשבוניות שתחובר בהמשך.</p>
        </div>
      </div>
    </div>
  `;

  const result = await sendSystemEmail([email], `מספר ההזמנה שלך - ${externalOrderId}`, html);
  if (!result.success) return { sent: false, reason: result.error || "email_failed" };

  await pool.query(
    `UPDATE orders SET external_order_email_sent_at = NOW() WHERE id = $1`,
    [order.id]
  );

  return { sent: true };
}
