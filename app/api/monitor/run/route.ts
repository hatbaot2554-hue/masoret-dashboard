import { NextResponse } from "next/server";
import { createDbPool } from "../../../lib/db";
import { createApprovalRequest } from "../../../lib/approvalRequests";
import { ensureCouponsTable } from "../../../lib/coupons";
import { sharedSecretAllowed } from "../../../lib/security";

const pool = createDbPool();

const WEBSITE_URL = process.env.WEBSITE_URL || process.env.SITE_URL || "https://masoret-website.vercel.app";

function cronAllowed(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const userAgent = request.headers.get("user-agent") || "";
  if (sharedSecretAllowed(request, "AUTOMATION_API_SECRET", "x-automation-secret")) return true;
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  if (userAgent.toLowerCase().includes("vercel-cron")) return true;
  if (!secret) return process.env.NODE_ENV !== "production";
  return false;
}

async function checkUrl(path: string, title: string) {
  try {
    const response = await fetch(`${WEBSITE_URL}${path}`, { cache: "no-store" });
    if (!response.ok) {
      await createApprovalRequest(pool, {
        title,
        description: `${WEBSITE_URL}${path} החזיר שגיאה ${response.status}.`,
        severity: response.status >= 500 ? "urgent" : "local",
        source: "internal-monitor",
        recommendedAction: "בדוק פריסה ולוגים של האתר.",
        actionKey: "monitor:url_failure",
        payload: { path, status: response.status },
        fingerprint: `monitor:url:${path}:${response.status}`,
      });
      return { path, ok: false, status: response.status };
    }
    return { path, ok: true, status: response.status };
  } catch (error) {
    await createApprovalRequest(pool, {
      title,
      description: error instanceof Error ? error.message : "בדיקת עמוד נכשלה.",
      severity: "urgent",
      source: "internal-monitor",
      recommendedAction: "בדוק זמינות אתר, דומיין ו-Vercel.",
      actionKey: "monitor:url_exception",
      payload: { path },
      fingerprint: `monitor:url:${path}:exception`,
    });
    return { path, ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

async function checkDatabase() {
  const checks: { key: string; ok: boolean; detail?: string }[] = [];
  try {
    await pool.query("SELECT 1");
    checks.push({ key: "database", ok: true });
  } catch (error) {
    checks.push({ key: "database", ok: false, detail: error instanceof Error ? error.message : "DB failed" });
    await createApprovalRequest(pool, {
      title: "חיבור למסד הנתונים נכשל",
      description: error instanceof Error ? error.message : "בדיקת מסד הנתונים נכשלה.",
      severity: "urgent",
      source: "internal-monitor",
      recommendedAction: "בדוק DATABASE_URL ב-Vercel ואת מצב Aiven.",
      actionKey: "monitor:database_failure",
      payload: {},
      fingerprint: "monitor:database_failure",
    });
  }

  try {
    await ensureCouponsTable(pool);
    await pool.query("SELECT COUNT(*) FROM orders");
    await pool.query("SELECT COUNT(*) FROM coupons");
    await pool.query("SELECT COUNT(*) FROM approval_requests");
    checks.push({ key: "critical_tables", ok: true });
  } catch (error) {
    checks.push({ key: "critical_tables", ok: false, detail: error instanceof Error ? error.message : "tables failed" });
    await createApprovalRequest(pool, {
      title: "בדיקת טבלאות קריטיות נכשלה",
      description: error instanceof Error ? error.message : "חסרה או תקולה טבלה קריטית.",
      severity: "urgent",
      source: "internal-monitor",
      recommendedAction: "בדוק טבלאות orders/coupons/approval_requests.",
      actionKey: "monitor:table_failure",
      payload: {},
      fingerprint: "monitor:table_failure",
    });
  }
  return checks;
}

export async function GET(request: Request) {
  if (!cronAllowed(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const [home, cart, products, db] = await Promise.all([
    checkUrl("/", "עמוד הבית לא נטען תקין"),
    checkUrl("/cart", "עמוד העגלה לא נטען תקין"),
    checkUrl("/products", "עמוד המוצרים לא נטען תקין"),
    checkDatabase(),
  ]);

  return NextResponse.json({
    ok: [home, cart, products].every((item) => item.ok) && db.every((item) => item.ok),
    checkedAt: new Date().toISOString(),
    checks: [home, cart, products, ...db],
  });
}
