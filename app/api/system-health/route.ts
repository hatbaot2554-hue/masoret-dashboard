import { NextResponse } from "next/server";
import crypto from "crypto";
import { createDbPool } from "../../lib/db";

type CheckStatus = "ok" | "missing" | "warning" | "error" | "unknown";

type HealthCheck = {
  key: string;
  label: string;
  scope: string;
  status: CheckStatus;
  detail: string;
};

const WEBSITE_HEALTH_URL = process.env.WEBSITE_HEALTH_URL || "https://masoret-website.vercel.app/api/system-health";

const pool = createDbPool();

function getAuthSecret(): string {
  return process.env.DASHBOARD_AUTH_SECRET?.trim() || "";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function canViewSystemHealth(payload: { username?: string; role?: string; exp?: number }): boolean {
  if (!payload?.username || (payload.exp && payload.exp <= Date.now())) return false;

  const allowedUsers = (process.env.DASHBOARD_OWNER_USERNAMES || "admin")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const role = String(payload.role || "").trim().toLowerCase();
  const username = String(payload.username || "").trim().toLowerCase();

  return (
    allowedUsers.includes(username) ||
    ["admin", "owner", "super_admin", "מנהל", "בעלים"].includes(role)
  );
}

function isDashboardRequest(request: Request): boolean {
  if (!getAuthSecret()) return false;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;

  try {
    const [payloadPart, signature] = token.split(".");
    if (!payloadPart || !signature) return false;

    const expectedSignature = sign(payloadPart);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    return canViewSystemHealth(payload);
  } catch {
    return false;
  }
}

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

async function databaseCheck(): Promise<HealthCheck> {
  if (!configured("DATABASE_URL")) {
    return {
      key: "DATABASE_URL",
      label: "מסד נתונים",
      scope: "לוח בקרה",
      status: "missing",
      detail: "לא נמצא חיבור למסד הנתונים בלוח הבקרה.",
    };
  }

  try {
    await pool.query("SELECT 1");
    return {
      key: "DATABASE_URL",
      label: "מסד נתונים",
      scope: "לוח בקרה",
      status: "ok",
      detail: "החיבור למסד הנתונים פעיל.",
    };
  } catch (error) {
    return {
      key: "DATABASE_URL",
      label: "מסד נתונים",
      scope: "לוח בקרה",
      status: "error",
      detail: error instanceof Error ? error.message : "בדיקת מסד הנתונים נכשלה.",
    };
  }
}

async function resendCheck(): Promise<HealthCheck> {
  if (!configured("RESEND_API_KEY")) {
    return {
      key: "RESEND_API_KEY",
      label: "שליחת מיילים",
      scope: "לוח בקרה",
      status: "missing",
      detail: "לא נמצא מפתח Resend בלוח הבקרה.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      cache: "no-store",
    });

    if (response.ok) {
      return {
        key: "RESEND_API_KEY",
        label: "שליחת מיילים",
        scope: "לוח בקרה",
        status: "ok",
        detail: "מפתח Resend קיים וענה בהצלחה.",
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        key: "RESEND_API_KEY",
        label: "שליחת מיילים",
        scope: "לוח בקרה",
        status: "ok",
        detail: "מפתח Resend מוגדר. למפתח יש כנראה הרשאת שליחה בלבד, ולכן בדיקת הדומיינים לא זמינה. שליחת מיילים ת��בדק בפועל במסך איפוס סיסמה או שליחת הודעה.",
      };
    }

    return {
      key: "RESEND_API_KEY",
      label: "שליחת מיילים",
      scope: "לוח בקרה",
      status: "warning",
      detail: `Resend החזיר תשובה ${response.status}. המפתח קיים, אך כדאי לבדוק אותו בשליחת מייל ניסיון.`,
    };
  } catch (error) {
    return {
      key: "RESEND_API_KEY",
      label: "שליחת מיילים",
      scope: "לוח בקרה",
      status: "error",
      detail: error instanceof Error ? error.message : "בדיקת Resend נכשלה.",
    };
  }
}

function localSecretCheck(name: string, label: string, scope: string, missingDetail: string): HealthCheck {
  return {
    key: name,
    label,
    scope,
    status: configured(name) ? "ok" : "missing",
    detail: configured(name) ? "המפתח מוגדר בסביבה הזו." : missingDetail,
  };
}

function externalSecretCheck(name: string, label: string, scope: string): HealthCheck {
  return {
    key: name,
    label,
    scope,
    status: "unknown",
    detail: "המפתח לא נמצא בתוך לוח הבקרה ולכן אי אפשר לבדוק אותו מכאן בלי לחשוף או לחבר את הסביבה החיצונית המתאימה.",
  };
}

async function websiteHealthChecks(): Promise<HealthCheck[]> {
  try {
    const response = await fetch(WEBSITE_HEALTH_URL, { cache: "no-store" });
    if (!response.ok) {
      return [
        {
          key: "WEBSITE_HEALTH",
          label: "בדיקות אתר הלקוחות",
          scope: "אתר הלקוחות",
          status: "warning",
          detail: `לוח הבקרה לא הצליח לקרוא את בדיקת אתר הלקוחות. תשובה: ${response.status}. ייתכן שצריך לפרוס את אתר הלקוחות מחדש.`,
        },
      ];
    }

    const data = await response.json();
    if (!Array.isArray(data?.checks)) return [];
    return data.checks;
  } catch (error) {
    return [
      {
        key: "WEBSITE_HEALTH",
        label: "בדיקות אתר הלקוחות",
        scope: "אתר הלקוחות",
        status: "warning",
        detail: error instanceof Error ? error.message : "בדיקת אתר הלקוחות נכשלה.",
      },
    ];
  }
}

export async function GET(request: Request) {
  if (!isDashboardRequest(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const websiteChecks = await websiteHealthChecks();
  const websiteKeys = new Set(websiteChecks.map((check) => check.key));

  const checks: HealthCheck[] = [
    await databaseCheck(),
    await resendCheck(),
    localSecretCheck(
      "DASHBOARD_AUTH_SECRET",
      "סוד התחברות ללוח הבקרה",
      "לוח בקרה",
      "לא מוגדר סוד ייעודי לחתימת התחברות. כרגע המערכת תשתמש בערך גיבוי, ומומלץ להגדיר סוד קבוע."
    ),
    localSecretCheck(
      "AUTOMATION_API_SECRET",
      "סוד גישה לאוטומציית הזמנות",
      "אוטומציית הזמנות",
      "לא מוגדר סוד ייעודי לאוטומציה. כרגע ניתן להשתמש בסוד לוח הבקרה, אבל מומלץ להגדיר סוד נפרד לפני שליחה בפועל."
    ),
    ...websiteChecks,
    ...(!websiteKeys.has("OPENAI_API_KEY") ? [externalSecretCheck("OPENAI_API_KEY", "OpenAI לשירות AI", "אתר הלקוחות")] : []),
    ...(!websiteKeys.has("GEMINI_API_KEY") ? [externalSecretCheck("GEMINI_API_KEY", "Gemini לשירות AI", "אתר הלקוחות")] : []),
    externalSecretCheck("SOURCE_EMAIL", "אימייל לאתר המקורי", "אוטומציית הזמנות"),
    externalSecretCheck("SOURCE_PASSWORD", "סיסמה לאתר המקורי", "אוטומציית הזמנות"),
    externalSecretCheck("AUTO_ORDER_SUBMIT", "אישור שליחת הזמנות בפועל", "אוטומציית הזמנות"),
  ];

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    safe: true,
    message: "הבדיקה לא מחזירה ערכי מפתחות, רק מצב כללי.",
    checks,
  });
}

