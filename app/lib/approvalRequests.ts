import { Pool } from "pg";
import { alertRecipients, sendSystemEmail } from "./email";

export type ApprovalSeverity = "info" | "local" | "improvement" | "urgent" | "security";

export type ApprovalInput = {
  title: string;
  description: string;
  severity?: ApprovalSeverity;
  source?: string;
  recommendedAction?: string;
  actionKey?: string;
  payload?: unknown;
  fingerprint?: string;
};

export async function ensureApprovalRequests(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      source TEXT NOT NULL DEFAULT 'system',
      recommended_action TEXT,
      action_key TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      fingerprint TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_pending_fingerprint_idx
    ON approval_requests (fingerprint)
    WHERE status = 'pending' AND fingerprint IS NOT NULL
  `);
}

function severityLabel(severity: string) {
  if (severity === "urgent") return "תיקון דחוף";
  if (severity === "security") return "אישור אבטחה";
  if (severity === "improvement") return "שיפור";
  if (severity === "local") return "תיקון מקומי";
  return "מידע לבדיקה";
}

async function approvalRecipients(pool: Pool) {
  const configuredRecipients = alertRecipients();
  if (configuredRecipients.length) return configuredRecipients;

  try {
    const result = await pool.query(`
      SELECT email
      FROM users
      WHERE is_active = TRUE
        AND email IS NOT NULL
        AND (
          LOWER(username) = 'admin'
          OR LOWER(role) IN ('admin', 'owner', 'super_admin')
        )
      LIMIT 5
    `);
    return result.rows.map((row) => String(row.email || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function notifyNewApproval(pool: Pool, input: ApprovalInput) {
  const recipients = await approvalRecipients(pool);
  if (!recipients.length) return;

  const severity = input.severity || "info";
  const dashboardUrl = process.env.DASHBOARD_URL || "https://masoret-dashboard.vercel.app";
  await sendSystemEmail(
    recipients,
    `מסורת: ${severityLabel(severity)} שמצריך אישור`,
    `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#092744">
        <h2>נפתחה בקשת אישור חדשה</h2>
        <p><strong>סוג:</strong> ${severityLabel(severity)}</p>
        <p><strong>כותרת:</strong> ${input.title}</p>
        <p><strong>פירוט:</strong> ${input.description}</p>
        ${input.recommendedAction ? `<p><strong>פעולה מומלצת:</strong> ${input.recommendedAction}</p>` : ""}
        <p>אפשר לאשר או לדחות בלוח הבקרה, בלשונית ניהול.</p>
        <p><a href="${dashboardUrl}">כניסה ללוח הבקרה</a></p>
      </div>
    `
  );
}

export async function createApprovalRequest(pool: Pool, input: ApprovalInput) {
  await ensureApprovalRequests(pool);
  const result = await pool.query(
    `
      INSERT INTO approval_requests
        (title, description, severity, source, recommended_action, action_key, payload, fingerprint)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      ON CONFLICT (fingerprint) WHERE status = 'pending' AND fingerprint IS NOT NULL
      DO NOTHING
      RETURNING *
    `,
    [
      input.title,
      input.description,
      input.severity || "info",
      input.source || "system",
      input.recommendedAction || null,
      input.actionKey || null,
      JSON.stringify(input.payload || {}),
      input.fingerprint || null,
    ]
  );

  if (result.rowCount) {
    await notifyNewApproval(pool, input).catch((error) => console.error("approval notification failed", error));
    return result.rows[0];
  }

  return null;
}
