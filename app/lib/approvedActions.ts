import { Pool } from "pg";
import { ensureCouponsTable, generateCouponCode } from "./coupons";

type ApprovalRow = {
  action_key?: string | null;
  payload?: Record<string, unknown> | null;
};

function approvalPayload(request: ApprovalRow): Record<string, unknown> {
  const value = request.payload || {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value;
}

function monitorPermissionMessage(payload: Record<string, unknown>) {
  const key = String(payload.key || "");
  const title = String(payload.title || "");
  const detail = String(payload.detail || "");
  const recommendedAction = String(payload.recommendedAction || "");
  const text = `${key} ${title} ${detail} ${recommendedAction}`;
  const envName =
    text.includes("VERCEL_MONITOR_TOKEN") ? "VERCEL_MONITOR_TOKEN" :
    text.includes("GITHUB_MONITOR_TOKEN") ? "GITHUB_MONITOR_TOKEN" :
    text.includes("REPAIR_GITHUB_TOKEN") ? "REPAIR_GITHUB_TOKEN" :
    text.includes("AIVEN_MONITOR_TOKEN") ? "AIVEN_MONITOR_TOKEN" :
    text.includes("RESEND_API_KEY") ? "RESEND_API_KEY" :
    text.includes("GEMINI_API_KEY") ? "GEMINI_API_KEY" :
    text.includes("OPENAI_API_KEY") ? "OPENAI_API_KEY" :
    "";

  if (!envName) return "";
  return `זוהתה סיבת הבעיה: חסר משתנה סביבה בשם ${envName}. זה לא באג בקוד שהמערכת יכולה לתקן לבד, כי הערך הוא סוד חיצוני שצריך להוסיף ב-Vercel. האישור נשמר, ולאחר שתוסיף את המשתנה ותעשה Redeploy הבדיקה אמורה להפוך לירוקה.`;
}

export async function executeApprovedAction(pool: Pool, request: ApprovalRow) {
  const actionKey = String(request.action_key || "");
  const payload = approvalPayload(request);

  if (actionKey === "approval:review_only") {
    return monitorPermissionMessage(payload) || "האישור נשמר למעקב. הבקשה הזו אינה כוללת פעולה אוטומטית בטוחה, ולכן לא בוצע שינוי קוד או שינוי הרשאות.";
  }

  if (actionKey === "site_control:disable_manual") {
    await pool.query(`
      UPDATE site_control
      SET manual_enabled = FALSE,
          manual_until = NULL,
          updated_at = NOW()
      WHERE id = TRUE
    `);
    return "מצב תחזוקה ידני כובה.";
  }

  if (actionKey === "site_control:enable_manual") {
    await pool.query(`
      UPDATE site_control
      SET manual_enabled = TRUE,
          manual_message = COALESCE($1, manual_message),
          manual_until = $2,
          updated_at = NOW()
      WHERE id = TRUE
    `, [
      typeof payload.message === "string" ? payload.message : null,
      typeof payload.until === "string" ? payload.until : null,
    ]);
    return "מצב תחזוקה ידני הופעל.";
  }

  if (actionKey === "coupon:create") {
    await ensureCouponsTable(pool);
    const benefitType = payload.benefitType === "fixed" ? "fixed" : "percent";
    const benefitValue = Math.max(0, Number(payload.benefitValue || 0));
    if (!benefitValue) throw new Error("חסר ערך זיכוי/הנחה ליצירת קופון.");
    const code = String(payload.code || generateCouponCode()).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    const result = await pool.query(
      `
        INSERT INTO coupons
          (code, owner_name, owner_email, owner_phone, benefit_type, benefit_value, remaining_value, usage_limit, source_order_id, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9)
        RETURNING code
      `,
      [
        code,
        payload.ownerName || null,
        typeof payload.ownerEmail === "string" ? payload.ownerEmail.toLowerCase() : null,
        payload.ownerPhone || null,
        benefitType,
        benefitValue,
        benefitType === "fixed" ? benefitValue : null,
        payload.sourceOrderId || null,
        payload.note || null,
      ]
    );
    return `נוצר קופון ${result.rows[0]?.code}.`;
  }

  return "";
}
