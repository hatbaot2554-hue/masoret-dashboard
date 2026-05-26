import { NextResponse } from "next/server";
import { createDbPool } from "../../lib/db";
import { isDashboardRequest, sharedSecretAllowed } from "../../lib/security";
import { createApprovalRequest, ensureApprovalRequests, type ApprovalSeverity } from "../../lib/approvalRequests";
import { executeApprovedAction } from "../../lib/approvedActions";

const pool = createDbPool();

function automationAllowed(request: Request) {
  return sharedSecretAllowed(request, "AUTOMATION_API_SECRET", "x-automation-secret");
}

export async function GET(request: Request) {
  if (!isDashboardRequest(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  await ensureApprovalRequests(pool);
  const result = await pool.query(`
    SELECT *
    FROM approval_requests
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      created_at DESC
    LIMIT 100
  `);
  return NextResponse.json({ requests: result.rows });
}

export async function POST(request: Request) {
  if (!isDashboardRequest(request) && !automationAllowed(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    title?: string;
    description?: string;
    severity?: ApprovalSeverity;
    source?: string;
    recommendedAction?: string;
    actionKey?: string;
    payload?: unknown;
    fingerprint?: string;
  };

  if (!body.title || !body.description) {
    return NextResponse.json({ error: "חסרים כותרת או פירוט" }, { status: 400 });
  }

  const row = await createApprovalRequest(pool, {
    title: String(body.title).slice(0, 300),
    description: String(body.description).slice(0, 3000),
    severity: body.severity || "info",
    source: body.source || "system",
    recommendedAction: body.recommendedAction,
    actionKey: body.actionKey,
    payload: body.payload || {},
    fingerprint: body.fingerprint,
  });

  return NextResponse.json({ created: Boolean(row), request: row });
}

export async function PATCH(request: Request) {
  if (!isDashboardRequest(request)) {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    id?: number;
    status?: "approved" | "rejected" | "done";
    decidedBy?: string;
  };

  if (!body.id || !["approved", "rejected", "done"].includes(String(body.status))) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  await ensureApprovalRequests(pool);
  let executionNote = "";
  if (body.status === "approved") {
    const existing = await pool.query("SELECT * FROM approval_requests WHERE id = $1 LIMIT 1", [body.id]);
    if (existing.rows[0]) {
      executionNote = await executeApprovedAction(pool, existing.rows[0]);
    }
  }

  const result = await pool.query(
    `
      UPDATE approval_requests
      SET status = $1,
          decided_by = $2,
          decided_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
    [body.status, body.decidedBy || "admin", body.id]
  );

  if (!result.rowCount) return NextResponse.json({ error: "הבקשה לא נמצאה" }, { status: 404 });
  return NextResponse.json({ request: result.rows[0], executionNote });
}
