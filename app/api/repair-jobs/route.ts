import { NextResponse } from 'next/server';
import { createDbPool } from '../../lib/db';
import { createApprovalRequest } from '../../lib/approvalRequests';
import { isDashboardRequest, sharedSecretAllowed } from '../../lib/security';

const pool = createDbPool();

type RepairLog = {
  at: string;
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
};

function canUseRepairApi(request: Request) {
  return isDashboardRequest(request) || sharedSecretAllowed(request, 'AUTOMATION_API_SECRET', 'x-automation-secret');
}

async function ensureRepairJobs() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS repair_jobs (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'needs_approval',
      requested_by TEXT,
      logs JSONB NOT NULL DEFAULT '[]'::jsonb,
      result TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function log(text: string, level: RepairLog['level'] = 'info'): RepairLog {
  return { at: new Date().toISOString(), level, text };
}

export async function GET(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }
    await ensureRepairJobs();
    const result = await pool.query(`SELECT * FROM repair_jobs ORDER BY created_at DESC LIMIT 50`);
    return NextResponse.json({ jobs: result.rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'שגיאת שרת' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }
    await ensureRepairJobs();
    const body = await request.json().catch(() => ({})) as { title?: string; prompt?: string; requestedBy?: string };
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return NextResponse.json({ error: 'חסרה בקשה לביצוע' }, { status: 400 });

    const title = String(body.title || '').trim() || (prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt);
    const logs = [
      log('הבקשה התקבלה בלוח הבקרה.'),
      log('נפתח תהליך אישור לפני שינוי קוד או חיבור למערכות חיצוניות.', 'warning'),
    ];

    const result = await pool.query(
      `INSERT INTO repair_jobs (title, prompt, status, requested_by, logs)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [title, prompt, 'needs_approval', body.requestedBy || null, JSON.stringify(logs)]
    );

    await createApprovalRequest(pool, {
      title: `בקשת תיקון/פיתוח: ${title}`,
      description: prompt,
      severity: 'improvement',
      source: 'ai-repair-center',
      recommendedAction: 'לאשר בלוח הבקרה כדי להעביר את המשימה לתיקון מבוקר.',
      actionKey: `repair_job:${result.rows[0].id}`,
      payload: { repairJobId: result.rows[0].id, prompt },
      fingerprint: `repair-job:${result.rows[0].id}`,
    }).catch((error) => console.error('repair approval request failed', error));

    return NextResponse.json({ job: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'שגיאת שרת' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!canUseRepairApi(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }
    await ensureRepairJobs();
    const body = await request.json().catch(() => ({})) as { id?: number; status?: string; message?: string; level?: RepairLog['level']; result?: string };
    if (!body.id) return NextResponse.json({ error: 'חסר מזהה תהליך' }, { status: 400 });

    const current = await pool.query(`SELECT logs FROM repair_jobs WHERE id = $1`, [body.id]);
    if (!current.rows.length) return NextResponse.json({ error: 'התהליך לא נמצא' }, { status: 404 });

    const logs = Array.isArray(current.rows[0].logs) ? current.rows[0].logs : [];
    if (body.message) logs.unshift(log(body.message, body.level || 'info'));

    const result = await pool.query(
      `UPDATE repair_jobs
       SET status = COALESCE($2, status),
           result = COALESCE($3, result),
           logs = $4::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [body.id, body.status || null, body.result || null, JSON.stringify(logs)]
    );
    return NextResponse.json({ job: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'שגיאת שרת' }, { status: 500 });
  }
}
