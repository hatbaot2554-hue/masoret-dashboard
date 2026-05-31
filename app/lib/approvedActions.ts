import { Pool } from "pg";
import { ensureCouponsTable, generateCouponCode } from "./coupons";

type ApprovalRow = {
  action_key?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function executeApprovedAction(pool: Pool, request: ApprovalRow) {
  const actionKey = String(request.action_key || "");
  const payload = request.payload || {};

  if (actionKey === "approval:review_only") {
    return "No automated action was executed. Approval was recorded for manual follow-up.";
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
