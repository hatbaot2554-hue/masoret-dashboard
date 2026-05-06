import { NextResponse } from "next/server";
import { Pool } from "pg";
import crypto from "crypto";

type CheckStatus = "ok" | "missing" | "warning" | "error" | "unknown";

type HealthCheck = {
  key: string;
  label: string;
  scope: string;
  status: CheckStatus;
  detail: string;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

function getAuthSecret(): string {
  return process.env.DASHBOARD_AUTH_SECRET || process.env.DATABASE_URL || "change-this-secret";
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
        detail: "מפתח Resend מוגדר. למפתח יש כנראה הרשאת שליחה בלבד, ולכן בדיקת הדומיינים לא זמינה. שליחת מיילים תיבדק בפועל במסך איפוס סיסמה או שליחת הודעה.",
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

export async function GET(request: Request) {
  if (!isDashboardRequest(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const checks: HealthCheck[] = [
    await databaseCheck(),
    await resendCheck(),
    localSecretCheck(
      "DASHBOARD_AUTH_SECRET",
      "סוד התחברות ללוח הבקרה",
      "לוח בקרה",
      "לא מוגדר סוד ייעודי לחתימת התחברות. כרגע המערכת תשתמש בערך גיבוי, ומומלץ להגדיר סוד קבוע."
    ),
    externalSecretCheck("OPENAI_API_KEY", "OpenAI לשירות AI", "אתר הלקוחות"),
    externalSecretCheck("GEMINI_API_KEY", "Gemini לשירות AI", "אתר הלקוחות"),
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
