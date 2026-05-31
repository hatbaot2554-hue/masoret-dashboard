import { NextResponse } from 'next/server';
import { createDbPool } from '../../../lib/db';
import { isDashboardRequest } from '../../../lib/security';

const pool = createDbPool();
const OWNER = 'hatbaot2554-hue';
const DASHBOARD_REPO = 'masoret-dashboard';
const WORKFLOW_FILE = 'repair-runner.yml';

type RepairLog = {
  at: string;
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
};

function log(text: string, level: RepairLog['level'] = 'info'): RepairLog {
  return { at: new Date().toISOString(), level, text };
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

async function appendJobLog(id: number, text: string, level: RepairLog['level'] = 'info', status?: string, result?: string) {
  await ensureRepairJobs();
  const current = await pool.query(`SELECT logs FROM repair_jobs WHERE id = $1`, [id]);
  const logs = Array.isArray(current.rows[0]?.logs) ? current.rows[0].logs : [];
  logs.unshift(log(text, level));
  await pool.query(
    `UPDATE repair_jobs
     SET status = COALESCE($2, status),
         result = COALESCE($3, result),
         logs = $4::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [id, status || null, result || null, JSON.stringify(logs)]
  );
}

function dashboardBaseUrl(request: Request) {
  return (
    process.env.DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    new URL(request.url).origin
  ).replace(/\/$/, '');
}

export async function POST(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as { id?: number };
    const id = Number(body.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'חסר מזהה משימת תיקון' }, { status: 400 });
    }

    await ensureRepairJobs();
    const job = await pool.query(`SELECT id, title, prompt FROM repair_jobs WHERE id = $1 LIMIT 1`, [id]);
    if (!job.rows[0]) return NextResponse.json({ error: 'משימת התיקון לא נמצאה' }, { status: 404 });

    const token = process.env.REPAIR_GITHUB_TOKEN || process.env.GITHUB_REPAIR_TOKEN || process.env.GITHUB_MONITOR_TOKEN;
    const automationSecret = process.env.AUTOMATION_API_SECRET;
    if (!token || !automationSecret) {
      const missing = [
        !token ? 'REPAIR_GITHUB_TOKEN' : '',
        !automationSecret ? 'AUTOMATION_API_SECRET' : '',
      ].filter(Boolean).join(', ');
      await appendJobLog(
        id,
        `רץ התיקונים לא הופעל כי חסרים משתני סביבה: ${missing}. צריך להוסיף אותם ב-Vercel ללוח הבקרה ואז לבצע Redeploy.`,
        'warning',
        'blocked',
        `חסרים משתני סביבה: ${missing}`
      );
      return NextResponse.json({ error: `חסרים משתני סביבה: ${missing}` }, { status: 409 });
    }

    await appendJobLog(id, 'מפעיל רץ תיקונים חינמי דרך GitHub Actions.', 'info', 'queued');

    const response = await fetch(`https://api.github.com/repos/${OWNER}/${DASHBOARD_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          job_id: String(id),
          prompt: String(job.rows[0].prompt || '').slice(0, 1000),
          dashboard_url: dashboardBaseUrl(request),
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      await appendJobLog(id, `GitHub Actions לא קיבל את ההפעלה. סטטוס ${response.status}. ${detail.slice(0, 300)}`, 'error', 'blocked');
      return NextResponse.json({ error: `GitHub Actions לא קיבל את ההפעלה: ${response.status}` }, { status: 502 });
    }

    await appendJobLog(id, 'רץ התיקונים נשלח ל-GitHub Actions. בעוד רגעים יתחילו להופיע שלבי עבודה חיים.', 'success', 'queued');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'שגיאת שרת בהפעלת רץ התיקונים' }, { status: 500 });
  }
}
