import { NextResponse } from "next/server";
import { createDbPool } from "../../lib/db";
import { isDashboardRequest, sharedSecretAllowed } from "../../lib/security";
import { ensureCouponsTable, generateCouponCode } from "../../lib/coupons";
import { sendSystemEmail } from "../../lib/email";

const pool = createDbPool();

function automationAllowed(request: Request) {
  return sharedSecretAllowed(request, "AUTOMATION_API_SECRET", "x-automation-secret");
}

export async function GET(request: Request) {
  if (!isDashboardRequest(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  await ensureCouponsTable(pool);
  const result = await pool.query("SELECT * FROM coupons ORDER BY created_at DESC LIMIT 200");
  return NextResponse.json({ coupons: result.rows });
}

export async function POST(request: Request) {
  if (!isDashboardRequest(request) && !automationAllowed(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    code?: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerPhone?: string;
    benefitType?: "percent" | "fixed";
    benefitValue?: number;
    usageLimit?: number;
    sourceOrderId?: string;
    note?: string;
    expiresAt?: string | null;
  };

  await ensureCouponsTable(pool);
  let code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  if (!code) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateCouponCode();
      const existing = await pool.query("SELECT id FROM coupons WHERE code = $1 LIMIT 1", [candidate]);
      if (!existing.rowCount) {
        code = candidate;
        break;
      }
    }
  }
  if (!code) code = generateCouponCode();

  const benefitType = body.benefitType === "fixed" ? "fixed" : "percent";
  const benefitValue = Math.max(0, Number(body.benefitValue || 0));
  if (!benefitValue) {
    return NextResponse.json({ error: "חסר ערך זיכוי/הנחה" }, { status: 400 });
  }

  const result = await pool.query(
    `
      INSERT INTO coupons
        (code, owner_name, owner_email, owner_phone, benefit_type, benefit_value, remaining_value, usage_limit, source_order_id, note, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `,
    [
      code,
      body.ownerName || null,
      String(body.ownerEmail || "").trim().toLowerCase() || null,
      body.ownerPhone || null,
      benefitType,
      benefitValue,
      benefitType === "fixed" ? benefitValue : null,
      Math.max(1, Number(body.usageLimit || 1)),
      body.sourceOrderId || null,
      body.note || null,
      body.expiresAt || null,
    ]
  );

  const coupon = result.rows[0];
  const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
  if (ownerEmail) {
    const benefitText = benefitType === "fixed" ? `₪${benefitValue}` : `${benefitValue}%`;
    await sendSystemEmail(
      [ownerEmail],
      "הזיכוי שלך באתר מסורת",
      `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#092744">
          <h2>קיבלת זיכוי באתר מסורת</h2>
          <p>קוד הקופון שלך:</p>
          <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${coupon.code}</p>
          <p>שווי ההטבה: ${benefitText}</p>
          <p>הקוד מיועד לשימוש בקופה באתר.</p>
        </div>
      `
    ).catch((error) => console.error("coupon email failed", error));
  }

  return NextResponse.json({ coupon });
}
