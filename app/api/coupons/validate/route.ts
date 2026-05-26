import { NextResponse } from "next/server";
import { createDbPool } from "../../../lib/db";
import { sharedSecretAllowed } from "../../../lib/security";
import { findValidCoupon } from "../../../lib/coupons";

const pool = createDbPool();

export async function POST(request: Request) {
  if (!sharedSecretAllowed(request, "DASHBOARD_ORDERS_API_SECRET", "x-dashboard-orders-secret")) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    code?: string;
    email?: string;
    phone?: string;
    subtotal?: number;
  };

  const match = await findValidCoupon(pool, body);
  if (!match) {
    return NextResponse.json({ valid: false, error: "הקופון לא נמצא או שכבר נוצל" }, { status: 404 });
  }

  return NextResponse.json({ valid: true, coupon: match.publicCoupon });
}
