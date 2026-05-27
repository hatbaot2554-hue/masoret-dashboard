import { NextResponse } from "next/server";
import { createDbPool } from "../../../lib/db";
import { createApprovalRequest } from "../../../lib/approvalRequests";
import { ensureCouponsTable } from "../../../lib/coupons";
import { sharedSecretAllowed } from "../../../lib/security";

type MonitorStatus = "ok" | "warning" | "error";

type MonitorCheck = {
  key: string;
  title: string;
  area: string;
  status: MonitorStatus;
  detail: string;
  recommendedAction?: string;
  severity?: "local" | "improvement" | "urgent" | "security";
  payload?: Record<string, unknown>;
};

const pool = createDbPool();

const WEBSITE_URL = process.env.WEBSITE_URL || process.env.SITE_URL || "https://masoret-website.vercel.app";
const PRODUCTS_CATALOG_URL =
  process.env.PRODUCTS_CATALOG_URL ||
  "https://raw.githubusercontent.com/hatbaot2554-hue/masoret-automation/main/products.json";

function cronAllowed(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const userAgent = request.headers.get("user-agent") || "";
  if (sharedSecretAllowed(request, "AUTOMATION_API_SECRET", "x-automation-secret")) return true;
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  if (userAgent.toLowerCase().includes("vercel-cron")) return true;
  return process.env.NODE_ENV !== "production";
}

function monitorCheck(input: MonitorCheck): MonitorCheck {
  return input;
}

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkUrl(path: string, title: string, area = "אתר הלקוחות"): Promise<MonitorCheck> {
  const url = `${WEBSITE_URL}${path}`;
  try {
    const response = await timedFetch(url);
    const ok = response.ok || (response.status >= 300 && response.status < 400);
    if (ok) {
      return monitorCheck({
        key: `url:${path}`,
        title,
        area,
        status: "ok",
        detail:
          response.status >= 300
            ? `הכתובת זמינה ומחזירה הפניה תקינה (${response.status}).`
            : `הכתובת זמינה (${response.status}).`,
        payload: { path, status: response.status },
      });
    }

    return monitorCheck({
      key: `url:${path}`,
      title,
      area,
      status: response.status >= 500 ? "error" : "warning",
      detail: `${url} החזיר שגיאה ${response.status}.`,
      recommendedAction: "בדוק את הפריסה האחרונה ואת כתובת העמוד באתר.",
      severity: response.status >= 500 ? "urgent" : "local",
      payload: { path, status: response.status },
    });
  } catch (error) {
    return monitorCheck({
      key: `url:${path}`,
      title,
      area,
      status: "error",
      detail: error instanceof Error ? error.message : "בדיקת זמינות העמוד נכשלה.",
      recommendedAction: "בדוק זמינות אתר, דומיין, Vercel וחסימות רשת.",
      severity: "urgent",
      payload: { path },
    });
  }
}

async function checkWebsiteHealth(): Promise<MonitorCheck[]> {
  const checks: MonitorCheck[] = [];
  checks.push(await checkUrl("/", "דף הבית"));
  checks.push(await checkUrl("/products?page=1", "עמוד כל הספרים"));
  checks.push(await checkUrl("/wishlist", "עמוד מועדפים"));
  checks.push(await checkUrl("/account", "אזור אישי"));
  checks.push(await checkUrl("/cart", "עמוד העגלה"));

  try {
    const response = await timedFetch(`${WEBSITE_URL}/api/system-health`);
    if (!response.ok) {
      checks.push(
        monitorCheck({
          key: "website:system-health",
          title: "בדיקת בריאות פנימית באתר",
          area: "אתר הלקוחות",
          status: "warning",
          detail: `/api/system-health באתר החזיר ${response.status}.`,
          recommendedAction: "בדוק שה-endpoint קיים ופרוס באתר הלקוחות.",
          severity: "local",
          payload: { status: response.status },
        })
      );
      return checks;
    }

    const data = await response.json().catch(() => null);
    const innerChecks: Array<{ status?: string }> = Array.isArray(data?.checks) ? data.checks : [];
    const failing = innerChecks.filter((item) => ["error", "missing"].includes(String(item?.status || "")));
    const warning = innerChecks.filter((item) => ["warning", "unknown"].includes(String(item?.status || "")));
    checks.push(
      monitorCheck({
        key: "website:system-health",
        title: "בדיקת בריאות פנימית באתר",
        area: "אתר הלקוחות",
        status: failing.length ? "error" : warning.length ? "warning" : "ok",
        detail: failing.length
          ? `נמצאו ${failing.length} תקלות פנימיות באתר הלקוחות.`
          : warning.length
            ? `נמצאו ${warning.length} אזהרות פנימיות באתר הלקוחות.`
            : "בדיקות אתר הלקוחות עברו בהצלחה.",
        recommendedAction: failing.length || warning.length ? "פתח את לשונית בריאות האתר בלוח הבקרה ובדוק את פירוט אתר הלקוחות." : undefined,
        severity: failing.length ? "urgent" : "local",
        payload: { failing: failing.length, warning: warning.length },
      })
    );
  } catch (error) {
    checks.push(
      monitorCheck({
        key: "website:system-health",
        title: "בדיקת בריאות פנימית באתר",
        area: "אתר הלקוחות",
        status: "warning",
        detail: error instanceof Error ? error.message : "בדיקת הבריאות הפנימית של האתר לא ענתה.",
        recommendedAction: "בדוק שהאתר פרוס וש-endpoint הבריאות פעיל.",
        severity: "local",
      })
    );
  }

  return checks;
}

async function checkDatabase(): Promise<MonitorCheck[]> {
  const checks: MonitorCheck[] = [];

  try {
    const db = await pool.query("SELECT current_database() AS database_name");
    checks.push(
      monitorCheck({
        key: "db:connection",
        title: "חיבור למסד הנתונים",
        area: "מסד נתונים",
        status: "ok",
        detail: `החיבור פעיל למסד ${db.rows[0]?.database_name || "לא ידוע"}.`,
      })
    );
  } catch (error) {
    return [
      monitorCheck({
        key: "db:connection",
        title: "חיבור למסד הנתונים",
        area: "מסד נתונים",
        status: "error",
        detail: error instanceof Error ? error.message : "חיבור למסד הנתונים נכשל.",
        recommendedAction: "בדוק DATABASE_URL, סיסמה, sslmode ומצב Aiven.",
        severity: "urgent",
      }),
    ];
  }

  try {
    await ensureCouponsTable(pool);
    const tables = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
      [["orders", "users", "coupons", "approval_requests", "contact_requests"]]
    );
    const found = new Set(tables.rows.map((row) => row.table_name));
    for (const table of ["orders", "users", "coupons", "approval_requests", "contact_requests"]) {
      const exists = found.has(table);
      checks.push(
        monitorCheck({
          key: `db:table:${table}`,
          title: `טבלת ${table}`,
          area: "מסד נתונים",
          status: exists ? "ok" : table === "contact_requests" ? "warning" : "error",
          detail: exists ? `הטבלה ${table} קיימת.` : `הטבלה ${table} חסרה.`,
          recommendedAction: exists ? undefined : "בדוק יצירת טבלאות ומיגרציות במסד הנתונים.",
          severity: exists ? undefined : table === "contact_requests" ? "local" : "urgent",
          payload: { table },
        })
      );
    }
  } catch (error) {
    checks.push(
      monitorCheck({
        key: "db:critical-tables",
        title: "טבלאות קריטיות",
        area: "מסד נתונים",
        status: "error",
        detail: error instanceof Error ? error.message : "בדיקת טבלאות קריטיות נכשלה.",
        recommendedAction: "בדוק הרשאות וטבלאות orders/users/coupons/approval_requests.",
        severity: "urgent",
      })
    );
  }

  try {
    const orders = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS recent,
        COUNT(*) FILTER (WHERE status IN ('needs_care', 'not_paid', 'source_submit_in_progress'))::int AS attention
      FROM orders
    `);
    const row = orders.rows[0] || {};
    const attention = Number(row.attention || 0);
    checks.push(
      monitorCheck({
        key: "orders:pipeline",
        title: "צינור ההזמנות",
        area: "הזמנות",
        status: attention > 20 ? "warning" : "ok",
        detail: `נמצאו ${Number(row.total || 0)} הזמנות, ${Number(row.recent || 0)} בשבוע האחרון, ${attention} דורשות תשומת לב.`,
        recommendedAction: attention > 20 ? "פתח את לשונית הזמנות וסנן לפי סטטוסים שדורשים טיפול." : undefined,
        severity: attention > 20 ? "local" : undefined,
      })
    );
  } catch (error) {
    checks.push(
      monitorCheck({
        key: "orders:pipeline",
        title: "צינור ההזמנות",
        area: "הזמנות",
        status: "error",
        detail: error instanceof Error ? error.message : "לא ניתן לקרוא נתוני הזמנות.",
        recommendedAction: "בדוק את טבלת orders ואת הרשאות מסד הנתונים.",
        severity: "urgent",
      })
    );
  }

  return checks;
}

async function checkCatalog(): Promise<MonitorCheck[]> {
  try {
    const response = await timedFetch(PRODUCTS_CATALOG_URL, {}, 15000);
    if (!response.ok) {
      return [
        monitorCheck({
          key: "catalog:products-json",
          title: "קובץ סנכרון מוצרים",
          area: "סנכרון",
          status: "warning",
          detail: `קובץ המוצרים החזיר ${response.status}.`,
          recommendedAction: "בדוק את GitHub Actions של סריקת המוצרים ואת products.json.",
          severity: "local",
        }),
      ];
    }

    const data = await response.json().catch(() => null);
    const products = Array.isArray(data) ? data : [];
    const categories = new Set<string>();
    let withImages = 0;
    let withVariations = 0;
    for (const product of products) {
      if (product?.image || product?.images?.length) withImages += 1;
      if (Array.isArray(product?.variations) && product.variations.length) withVariations += 1;
      for (const value of [
        product?.category,
        product?.category_name,
        product?.main_category,
        ...(Array.isArray(product?.categories) ? product.categories : []),
      ]) {
        if (typeof value === "string" && value.trim()) categories.add(value.trim());
      }
    }

    return [
      monitorCheck({
        key: "catalog:products-json",
        title: "קובץ סנכרון מוצרים",
        area: "סנכרון",
        status: products.length > 0 ? "ok" : "warning",
        detail: `נטענו ${products.length} מוצרים, ${categories.size} קטגוריות מזוהות, ${withImages} מוצרים עם תמונה.`,
        recommendedAction: products.length > 0 ? undefined : "הרץ מחדש את סריקת המוצרים.",
        severity: products.length > 0 ? undefined : "local",
      }),
      monitorCheck({
        key: "catalog:variations",
        title: "אפשרויות בחירה במוצרים",
        area: "סנכרון",
        status: withVariations > 0 ? "ok" : "warning",
        detail: `נמצאו ${withVariations} מוצרים עם וריאציות בקובץ הסנכרון.`,
        recommendedAction: withVariations > 0 ? undefined : "בדוק שהסורק אוסף attributes ו-variations מהאתר המקורי.",
        severity: withVariations > 0 ? undefined : "local",
      }),
    ];
  } catch (error) {
    return [
      monitorCheck({
        key: "catalog:products-json",
        title: "קובץ סנכרון מוצרים",
        area: "סנכרון",
        status: "warning",
        detail: error instanceof Error ? error.message : "לא ניתן לקרוא את קובץ המוצרים.",
        recommendedAction: "בדוק GitHub Actions ואת products.json.",
        severity: "local",
      }),
    ];
  }
}

async function createApprovalRequests(checks: MonitorCheck[]) {
  const actionable = checks.filter((item) => item.status === "error" || item.status === "warning");
  await Promise.all(
    actionable.slice(0, 10).map((item) =>
      createApprovalRequest(pool, {
        title: `${item.title} - ${item.area}`,
        description: item.detail,
        severity: item.severity || (item.status === "error" ? "urgent" : "local"),
        source: "internal-monitor",
        recommendedAction: item.recommendedAction || "בדוק בלשונית בריאות האתר.",
        actionKey: item.key,
        payload: item,
        fingerprint: `internal-monitor:${item.key}:${item.status}`,
      })
    )
  );
}

function buildSummary(checks: MonitorCheck[]) {
  const totals = {
    ok: checks.filter((item) => item.status === "ok").length,
    warning: checks.filter((item) => item.status === "warning").length,
    error: checks.filter((item) => item.status === "error").length,
  };
  return {
    status: totals.error ? "critical" : totals.warning ? "attention" : "healthy",
    totals,
  };
}

export async function GET(request: Request) {
  if (!cronAllowed(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const [website, database, catalog] = await Promise.all([checkWebsiteHealth(), checkDatabase(), checkCatalog()]);
  const checks = [...website, ...database, ...catalog];
  await createApprovalRequests(checks).catch((error) => console.error("monitor approval request creation failed", error));

  return NextResponse.json({
    ok: checks.every((item) => item.status !== "error"),
    checkedAt: new Date().toISOString(),
    summary: buildSummary(checks),
    checks,
  });
}
