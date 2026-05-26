import { Pool } from "pg";

export type CouponValidationInput = {
  code?: string;
  email?: string;
  phone?: string;
  subtotal?: number;
};

function normalizeCode(value?: string) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeEmail(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

export function generateCouponCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function ensureCouponsTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id BIGSERIAL PRIMARY KEY,
      code TEXT UNIQUE,
      owner_name TEXT,
      owner_email TEXT,
      owner_phone TEXT,
      benefit_type TEXT NOT NULL DEFAULT 'percent',
      benefit_value NUMERIC NOT NULL DEFAULT 0,
      remaining_value NUMERIC,
      usage_limit INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      source_order_id TEXT,
      note TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    ALTER TABLE coupons
    ADD COLUMN IF NOT EXISTS owner_name TEXT,
    ADD COLUMN IF NOT EXISTS owner_email TEXT,
    ADD COLUMN IF NOT EXISTS owner_phone TEXT,
    ADD COLUMN IF NOT EXISTS benefit_type TEXT NOT NULL DEFAULT 'percent',
    ADD COLUMN IF NOT EXISTS benefit_value NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS remaining_value NUMERIC,
    ADD COLUMN IF NOT EXISTS usage_limit INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS source_order_id TEXT,
    ADD COLUMN IF NOT EXISTS note TEXT,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ
  `);
}

export async function findValidCoupon(pool: Pool, input: CouponValidationInput) {
  await ensureCouponsTable(pool);
  const code = normalizeCode(input.code);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const subtotal = Math.max(0, Number(input.subtotal || 0));

  const conditions: string[] = [];
  const params: string[] = [];

  if (code) {
    params.push(code);
    conditions.push(`UPPER(code) = $${params.length}`);
  }
  if (email) {
    params.push(email);
    conditions.push(`LOWER(COALESCE(owner_email, '')) = $${params.length}`);
  }
  if (phone) {
    params.push(phone);
    conditions.push(`regexp_replace(COALESCE(owner_phone, ''), '\\D', '', 'g') = $${params.length}`);
  }

  if (!conditions.length) return null;

  const result = await pool.query(
    `
      SELECT *
      FROM coupons
      WHERE (${conditions.join(" OR ")})
        AND status = 'active'
        AND used_count < usage_limit
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY
        CASE WHEN UPPER(COALESCE(code, '')) = $1 THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    `,
    params
  );

  const coupon = result.rows[0];
  if (!coupon) return null;

  const benefitType = String(coupon.benefit_type || "percent");
  const benefitValue = Number(coupon.benefit_value || 0);
  const remainingValue = coupon.remaining_value === null ? null : Number(coupon.remaining_value || 0);
  const discount =
    benefitType === "fixed"
      ? Math.min(subtotal, remainingValue ?? benefitValue)
      : Math.min(subtotal, Math.round((subtotal * benefitValue) / 100));

  if (discount <= 0) return null;

  return {
    coupon,
    discount,
    publicCoupon: {
      id: coupon.id,
      code: coupon.code,
      benefitType,
      benefitValue,
      discount,
      ownerName: coupon.owner_name,
      expiresAt: coupon.expires_at,
    },
  };
}

export async function redeemCoupon(pool: Pool, couponId: number, discount: number) {
  await ensureCouponsTable(pool);
  const result = await pool.query(
    `
      UPDATE coupons
      SET used_count = used_count + 1,
          remaining_value = CASE
            WHEN benefit_type = 'fixed' AND remaining_value IS NOT NULL THEN GREATEST(remaining_value - $2, 0)
            ELSE remaining_value
          END,
          status = CASE
            WHEN usage_limit <= used_count + 1 THEN 'used'
            WHEN benefit_type = 'fixed' AND remaining_value IS NOT NULL AND GREATEST(remaining_value - $2, 0) <= 0 THEN 'used'
            ELSE status
          END,
          used_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND status = 'active'
        AND used_count < usage_limit
      RETURNING *
    `,
    [couponId, discount]
  );
  return result.rows[0] || null;
}
