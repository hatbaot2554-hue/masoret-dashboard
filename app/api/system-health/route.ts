import { NextResponse } from "next/server";
import crypto from "crypto";
import { createDbPool } from "../../lib/db";
import { createApprovalRequest } from "../../lib/approvalRequests";

type CheckStatus = "ok" | "missing" | "warning" | "error" | "unknown";

type HealthCheck = {
  key: string;
  label: string;
  scope: string;
  status: CheckStatus;
  detail: string;
  impact?: string;
  nextStep?: string;
};

type HealthSummary = {
  status: "healthy" | "attention" | "critical";
  label: string;
  detail: string;
  totals: Record<CheckStatus, number>;
};

const WEBSITE_URL = process.env.WEBSITE_URL || process.env.SITE_URL || "https://masoret-website.vercel.app";
const WEBSITE_HEALTH_URL = process.env.WEBSITE_HEALTH_URL || `${WEBSITE_URL}/api/system-health`;
const PRODUCTS_CATALOG_URL =
  process.env.PRODUCTS_CATALOG_URL ||
  "https://raw.githubusercontent.com/hatbaot2554-hue/masoret-automation/main/products.json";

const pool = createDbPool();

function getAuthSecret(): string {
  return process.env.DASHBOARD_AUTH_SECRET?.trim() || "";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function canViewSystemHealth(payload: { username?: string; role?: string; exp?: number }): boolean {
  if (!payload?.username || (payload.exp && payload.exp <= Date.now())) return false;

  const allowedUsers = (process.env.DASHBOARD_OWNER_USERNAMES || "admin")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const role = String(payload.role || "").trim().toLowerCase();
  const username = String(payload.username || "").trim().toLowerCase();

  return allowedUsers.includes(username) || ["admin", "owner", "super_admin", "מנהל", "בעלים"].includes(role);
}

function isDashboardRequest(request: Request): boolean {
  if (!getAuthSecret()) return false;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;

  try {
    const [payloadPart, signature] = token.split(".");
    if (!payloadPart || !signature) return false;
    if (!safeCompare(signature, sign(payloadPart))) return false;

    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    return canViewSystemHealth(payload);
  } catch {
    return false;
  }
}

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function check(
  key: string,
  label: string,
  scope: string,
  status: CheckStatus,
  detail: string,
  impact?: string,
  nextStep?: string
): HealthCheck {
  return { key, label, scope, status, detail, impact, nextStep };
}

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function siteAvailabilityChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  try {
    const response = await timedFetch(WEBSITE_URL, {}, 10000);
    checks.push(
      check(
        "WEBSITE_HOME",
        "טעינת האתר",
        "אתר לקוחות",
        response.ok ? "ok" : "error",
        response.ok ? `עמוד הבית נטען בהצלחה (${response.status}).` : `עמוד הבית החזיר שגיאה ${response.status}.`,
        "אם עמוד הבית לא נטען, לקוחות לא יכולים לקנות.",
        response.ok ? undefined : "בדוק פריסת Vercel אחרונה ולוגים של האתר."
      )
    );
  } catch (error) {
    checks.push(
      check(
        "WEBSITE_HOME",
        "טעינת האתר",
        "אתר לקוחות",
        "error",
        error instanceof Error ? error.message : "האתר לא ענה בזמן.",
        "לקוחות עלולים לראות אתר לא זמין.",
        "בדוק זמינות Vercel, דומיין וחסימות רשת."
      )
    );
  }

  try {
    const response = await timedFetch(`${WEBSITE_URL}/api/orders?account=0500000000`, {}, 10000);
    checks.push(
      check(
        "CUSTOMER_ORDERS_API",
        "מעקב הזמנות ללקוח",
        "אתר לקוחות",
        response.ok ? "ok" : "error",
        response.ok ? "API מעקב הזמנות ענה בהצלחה." : `API מעקב הזמנות החזיר ${response.status}.`,
        "אם בדיקה זו נכשלת, האזור האישי ומעקב הזמנה עלולים להציג שגיאת שרת.",
        response.ok ? undefined : "בדוק את חיבור DATABASE_URL בלוח הבקרה ובאתר."
      )
    );
  } catch (error) {
    checks.push(
      check(
        "CUSTOMER_ORDERS_API",
        "מעקב הזמנות ללקוח",
        "אתר לקוחות",
        "error",
        error instanceof Error ? error.message : "API מעקב הזמנות לא ענה.",
        "לקוחות לא יוכלו לראות הזמנות.",
        "בדוק לוגים של האתר ושל לוח הבקרה."
      )
    );
  }

  try {
    const response = await timedFetch(`${WEBSITE_URL}/api/products?limit=1`, {}, 10000);
    checks.push(
      check(
        "PRODUCTS_API",
        "טעינת מוצרים",
        "אתר לקוחות",
        response.ok ? "ok" : "warning",
        response.ok ? "API מוצרים ענה בהצלחה." : `API מוצרים החזיר ${response.status}.`,
        "אם מוצרים לא נטענים, קטגוריות ודפי מוצר עלולים להיפגע.",
        response.ok ? undefined : "בדוק סנכרון מוצרים ונתוני products.json."
      )
    );
  } catch (error) {
    checks.push(
      check(
        "PRODUCTS_API",
        "טעינת מוצרים",
        "אתר לקוחות",
        "warning",
        error instanceof Error ? error.message : "API מוצרים לא ענה.",
        "ייתכן שחלק מהקטלוג לא יוצג.",
        "בדוק סנכרון מוצרים ופריסת האתר."
      )
    );
  }

  return checks;
}

async function websiteInternalHealthChecks(): Promise<HealthCheck[]> {
  try {
    const response = await timedFetch(WEBSITE_HEALTH_URL, {}, 10000);
    if (!response.ok) {
      return [
        check(
          "WEBSITE_HEALTH",
          "בדיקות פנימיות באתר",
          "אתר לקוחות",
          "warning",
          `בדיקות האתר החזירו ${response.status}.`,
          "חלק מבדיקות האתר הפנימיות לא זמינות.",
          "בדוק את endpoint /api/system-health באתר."
        ),
      ];
    }

    const data = await response.json().catch(() => null);
    if (!Array.isArray(data?.checks)) return [];
    return data.checks.map((item: HealthCheck) => ({
      key: item.key || "WEBSITE_CHECK",
      label: item.label || "בדיקת אתר",
      scope: item.scope || "אתר לקוחות",
      status: item.status || "unknown",
      detail: item.detail || "",
      impact: item.impact,
      nextStep: item.nextStep,
    }));
  } catch (error) {
    return [
      check(
        "WEBSITE_HEALTH",
        "בדיקות פנימיות באתר",
        "אתר לקוחות",
        "warning",
        error instanceof Error ? error.message : "בדיקות האתר לא ענו.",
        "אין כרגע תמונת עומק מהאתר עצמו.",
        "בדוק אם endpoint הבריאות באתר קיים ופרוס."
      ),
    ];
  }
}

async function databaseChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  if (!configured("DATABASE_URL")) {
    return [
      check(
        "DATABASE_URL",
        "חיבור למסד נתונים",
        "מסד נתונים",
        "missing",
        "לא מוגדר DATABASE_URL בלוח הבקרה.",
        "לוח הבקרה והאזור האישי לא יוכלו לקרוא הזמנות.",
        "הגדר DATABASE_URL ב-Vercel."
      ),
    ];
  }

  try {
    const db = await pool.query("SELECT current_database() AS database_name, NOW() AS checked_at");
    checks.push(
      check(
        "DATABASE_CONNECTION",
        "חיבור למסד נתונים",
        "מסד נתונים",
        "ok",
        `החיבור פעיל למסד ${db.rows[0]?.database_name || "לא ידוע"}.`
      )
    );
  } catch (error) {
    return [
      check(
        "DATABASE_CONNECTION",
        "חיבור למסד נתונים",
        "מסד נתונים",
        "error",
        error instanceof Error ? error.message : "בדיקת מסד הנתונים נכשלה.",
        "מערכת ההזמנות, לוח הבקרה והאזור האישי עלולים להפסיק לעבוד.",
        "בדוק DATABASE_URL, סיסמה, sslmode ושם מסד."
      ),
    ];
  }

  const tableNames = ["orders", "users", "contact_requests", "reset_codes", "waitlist"];
  const tables = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [tableNames]
  );
  const foundTables = new Set(tables.rows.map((row) => row.table_name));

  for (const tableName of tableNames) {
    const exists = foundTables.has(tableName);
    checks.push(
      check(
        `TABLE_${tableName.toUpperCase()}`,
        `טבלת ${tableName}`,
        "מסד נתונים",
        exists ? "ok" : tableName === "waitlist" || tableName === "reset_codes" ? "warning" : "error",
        exists ? `הטבלה ${tableName} קיימת.` : `הטבלה ${tableName} לא נמצאה.`,
        exists ? undefined : "חלק מהיכולות שתלויות בטבלה זו לא יעבדו.",
        exists ? undefined : "בדוק מיגרציה/יצירת טבלאות במסד."
      )
    );
  }

  try {
    const orderStats = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS recent,
        COUNT(*) FILTER (WHERE status IN ('needs_care', 'not_paid', 'source_submit_in_progress'))::int AS attention
      FROM orders
    `);
    const row = orderStats.rows[0] || {};
    const total = Number(row.total || 0);
    const recent = Number(row.recent || 0);
    const attention = Number(row.attention || 0);

    checks.push(
      check(
        "ORDER_PIPELINE",
        "צינור הזמנות",
        "הזמנות",
        total > 0 ? (attention > 20 ? "warning" : "ok") : "warning",
        `נמצאו ${total} הזמנות, מתוכן ${recent} ב-30 הימים האחרונים ו-${attention} דורשות תשומת לב.`,
        "ריבוי הזמנות תקועות יכול להעיד על בעיה בתשלום, אוטומציה או טיפול ידני.",
        attention > 20 ? "פתח את לשונית הזמנות וסנן לפי סטטוסים שדורשים טיפול." : undefined
      )
    );
  } catch (error) {
    checks.push(
      check(
        "ORDER_PIPELINE",
        "צינור הזמנות",
        "הזמנות",
        "error",
        error instanceof Error ? error.message : "לא ניתן לקרוא נתוני הזמנות.",
        "לוח הבקרה לא יוכל להציג הזמנות.",
        "בדוק הרשאות וטבלת orders."
      )
    );
  }

  try {
    const users = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE is_active = TRUE");
    const total = Number(users.rows[0]?.total || 0);
    checks.push(
      check(
        "DASHBOARD_USERS",
        "משתמשי לוח בקרה",
        "לוח בקרה",
        total > 0 ? "ok" : "error",
        total > 0 ? `נמצאו ${total} משתמשים פעילים.` : "לא נמצאו משתמשים פעילים.",
        "בלי משתמש פעיל אי אפשר לנהל את האתר.",
        total > 0 ? undefined : "צור משתמש מנהל במסד."
      )
    );
  } catch (error) {
    checks.push(
      check(
        "DASHBOARD_USERS",
        "משתמשי לוח בקרה",
        "לוח בקרה",
        "warning",
        error instanceof Error ? error.message : "לא ניתן לקרוא משתמשים.",
        "ייתכן שהתחברות ללוח הבקרה תיכשל.",
        "בדוק טבלת users."
      )
    );
  }

  return checks;
}

async function catalogChecks(): Promise<HealthCheck[]> {
  try {
    const response = await timedFetch(PRODUCTS_CATALOG_URL, {}, 12000);
    if (!response.ok) {
      return [
        check(
          "PRODUCT_CATALOG_SOURCE",
          "קטלוג מוצרים מסונכרן",
          "סנכרון מוצרים",
          "warning",
          `קובץ המוצרים החזיר ${response.status}.`,
          "ייתכן שמוצרים חדשים או קטגוריות חדשות לא יתעדכנו באתר.",
          "בדוק את GitHub Actions של סריקת המוצרים."
        ),
      ];
    }

    const data = await response.json().catch(() => null);
    const products = Array.isArray(data) ? data : [];
    const categories = new Set<string>();
    const withVariations = products.filter((product) => Array.isArray(product?.variations) && product.variations.length > 0).length;
    for (const product of products) {
      const categoryValues = [product?.category, product?.category_name, product?.main_category, ...(Array.isArray(product?.categories) ? product.categories : [])];
      for (const value of categoryValues) {
        if (typeof value === "string" && value.trim()) categories.add(value.trim());
      }
    }

    return [
      check(
        "PRODUCT_CATALOG_SOURCE",
        "קטלוג מוצרים מסונכרן",
        "סנכרון מוצרים",
        products.length > 0 ? "ok" : "warning",
        `נמצאו ${products.length} מוצרים בקובץ הסנכרון ו-${categories.size} קטגוריות מזוהות.`,
        "זה המקור שממנו האתר מציג מוצרים וקטגוריות אחרי סנכרון.",
        products.length > 0 ? undefined : "הרץ מחדש את סריקת המוצרים ב-GitHub Actions."
      ),
      check(
        "PRODUCT_VARIATIONS",
        "וריאציות מוצר",
        "סנכרון מוצרים",
        withVariations > 0 ? "ok" : "warning",
        `נמצאו ${withVariations} מוצרים עם וריאציות בקובץ הסנכרון.`,
        "אם וריאציות לא מסתנכרנות, אפשרויות כמו צבע/צבע ספרון לא יופיעו באתר.",
        withVariations > 0 ? undefined : "בדוק שהסורק אוסף attributes ו-variations מהאתר המקורי."
      ),
    ];
  } catch (error) {
    return [
      check(
        "PRODUCT_CATALOG_SOURCE",
        "קטלוג מוצרים מסונכרן",
        "סנכרון מוצרים",
        "warning",
        error instanceof Error ? error.message : "לא ניתן לקרוא את קובץ המוצרים.",
        "לא ניתן לדעת אם האתר כפיל עדכני של המקור.",
        "בדוק GitHub Actions וקובץ products.json."
      ),
    ];
  }
}

async function resendCheck(): Promise<HealthCheck> {
  if (!configured("RESEND_API_KEY")) {
    return check(
      "RESEND_API_KEY",
      "שליחת מיילים",
      "מיילים",
      "missing",
      "לא נמצא מפתח Resend בלוח הבקרה.",
      "איפוס סיסמה ושליחת הודעות מייל עלולים להיכשל.",
      "הגדר RESEND_API_KEY ב-Vercel."
    );
  }

  try {
    const response = await timedFetch(
      "https://api.resend.com/domains",
      { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } },
      10000
    );

    if (response.ok || response.status === 401 || response.status === 403) {
      return check(
        "RESEND_API_KEY",
        "שליחת מיילים",
        "מיילים",
        "ok",
        "מפתח Resend מוגדר. הרשאות השליחה ייבדקו בפעולת מייל בפועל."
      );
    }

    return check(
      "RESEND_API_KEY",
      "שליחת מיילים",
      "מיילים",
      "warning",
      `Resend החזיר תשובה ${response.status}.`,
      "ייתכן שחלק מהמיילים לא יישלחו.",
      "בדוק את מפתח Resend והדומיין המאומת."
    );
  } catch (error) {
    return check(
      "RESEND_API_KEY",
      "שליחת מיילים",
      "מיילים",
      "warning",
      error instanceof Error ? error.message : "בדיקת Resend נכשלה.",
      "ייתכן שמיילים לא יישלחו.",
      "בדוק את Resend ואת החיבור החיצוני."
    );
  }
}

function secretChecks(): HealthCheck[] {
  return [
    check(
      "DASHBOARD_AUTH_SECRET",
      "סוד התחברות לוח בקרה",
      "אבטחה",
      configured("DASHBOARD_AUTH_SECRET") ? "ok" : "missing",
      configured("DASHBOARD_AUTH_SECRET") ? "סוד התחברות מוגדר." : "לא מוגדר סוד התחברות.",
      "בלי סוד חזק אי אפשר להגן טוב על session של לוח הבקרה.",
      configured("DASHBOARD_AUTH_SECRET") ? undefined : "הגדר DASHBOARD_AUTH_SECRET חזק ב-Vercel."
    ),
    check(
      "AUTOMATION_API_SECRET",
      "סוד אוטומציית הזמנות",
      "אוטומציה",
      configured("AUTOMATION_API_SECRET") ? "ok" : "warning",
      configured("AUTOMATION_API_SECRET") ? "סוד אוטומציה ייעודי מוגדר." : "לא מוגדר סוד אוטומציה ייעודי.",
      "סוד ייעודי מפריד בין לוח הבקרה לבין האוטומציות.",
      configured("AUTOMATION_API_SECRET") ? undefined : "מומלץ להגדיר AUTOMATION_API_SECRET נפרד."
    ),
    check(
      "SOURCE_CREDENTIALS",
      "פרטי גישה לאוטומציה מול הספק",
      "אוטומציה",
      "unknown",
      "פרטי הגישה נמצאים מחוץ ללוח הבקרה ולכן לא נבדקים מכאן.",
      "אם הם חסרים או שגויים, שליחת הזמנות לאתר המקור תיכשל.",
      "בדוק GitHub Secrets של מאגר האוטומציה."
    ),
    check(
      "AUTO_ORDER_SUBMIT",
      "שליחת הזמנות בפועל",
      "אוטומציה",
      "unknown",
      "אישור שליחה בפועל נשמר מחוץ ללוח הבקרה.",
      "אם הוא כבוי, הזמנות יכולות להישאר במצב סימולציה/טיפול.",
      "בדוק את GitHub Secrets ואת ריצת auto_orders."
    ),
  ];
}

function buildSummary(checks: HealthCheck[]): HealthSummary {
  const totals: Record<CheckStatus, number> = { ok: 0, missing: 0, warning: 0, error: 0, unknown: 0 };
  for (const item of checks) totals[item.status] += 1;

  if (totals.error > 0 || totals.missing > 0) {
    return {
      status: "critical",
      label: "דורש טיפול מיידי",
      detail: `נמצאו ${totals.error} שגיאות ו-${totals.missing} הגדרות חסרות.`,
      totals,
    };
  }

  if (totals.warning > 0 || totals.unknown > 0) {
    return {
      status: "attention",
      label: "תקין עם נקודות לבדיקה",
      detail: `המערכת עובדת, אבל יש ${totals.warning} אזהרות ו-${totals.unknown} בדיקות חיצוניות שלא ניתן לאמת מכאן.`,
      totals,
    };
  }

  return {
    status: "healthy",
    label: "המערכת תקינה",
    detail: "כל הבדיקות הזמינות עברו בהצלחה.",
    totals,
  };
}

async function createApprovalRequestsForCriticalChecks(checks: HealthCheck[]) {
  const needsApproval = checks.filter((item) => item.status === "error" || item.status === "missing");
  await Promise.all(
    needsApproval.slice(0, 8).map((item) =>
      createApprovalRequest(pool, {
        title: `${item.label} - ${item.scope}`,
        description: item.detail,
        severity: item.scope.includes("אבטחה") ? "security" : item.status === "error" ? "urgent" : "local",
        source: "system-health",
        recommendedAction: item.nextStep || item.impact || "בדיקה ותיקון בלוח הבקרה.",
        actionKey: item.key,
        payload: item,
        fingerprint: `system-health:${item.key}:${item.status}`,
      })
    )
  );
}

export async function GET(request: Request) {
  if (!isDashboardRequest(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const [siteChecks, websiteChecks, dbChecks, catalogChecksResult, mailCheck] = await Promise.all([
    siteAvailabilityChecks(),
    websiteInternalHealthChecks(),
    databaseChecks(),
    catalogChecks(),
    resendCheck(),
  ]);

  const checks: HealthCheck[] = [
    ...siteChecks,
    ...websiteChecks,
    ...dbChecks,
    ...catalogChecksResult,
    mailCheck,
    ...secretChecks(),
  ];
  await createApprovalRequestsForCriticalChecks(checks).catch((error) =>
    console.error("approval request creation failed", error)
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    safe: true,
    message: "הבדיקה לא מחזירה ערכי מפתחות או סיסמאות, רק מצב כללי והמלצות.",
    summary: buildSummary(checks),
    checks,
  });
}
