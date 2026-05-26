import { NextResponse } from 'next/server';
import { createDbPool } from '../../lib/db';
import { isDashboardRequest } from '../../lib/security';

type ShabbatWindow = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
};

type SiteControlRow = {
  manual_enabled: boolean;
  manual_message: string | null;
  manual_until: string | null;
  shabbat_schedules: ShabbatWindow[] | string | null;
  updated_at: string;
};

const pool = createDbPool();

function parseSchedules(value: SiteControlRow['shabbat_schedules']): ShabbatWindow[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function activeSchedule(schedules: ShabbatWindow[], now = new Date()) {
  return schedules.find((item) => {
    const start = new Date(item.startsAt);
    const end = new Date(item.endsAt);
    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start <= now && now < end;
  });
}

async function ensureSiteControl() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_control (
      id BOOLEAN PRIMARY KEY DEFAULT TRUE,
      manual_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      manual_message TEXT,
      manual_until TIMESTAMPTZ,
      shabbat_schedules JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (id = TRUE)
    )
  `);
  await pool.query(`
    INSERT INTO site_control (id)
    VALUES (TRUE)
    ON CONFLICT (id) DO NOTHING
  `);
}

function publicState(row: SiteControlRow) {
  const schedules = parseSchedules(row.shabbat_schedules);
  const shabbat = activeSchedule(schedules);
  const manualUntil = row.manual_until ? new Date(row.manual_until) : null;
  const manualActive = Boolean(row.manual_enabled && (!manualUntil || manualUntil > new Date()));
  const active = Boolean(shabbat || manualActive);

  return {
    active,
    mode: shabbat ? 'shabbat' : manualActive ? 'maintenance' : 'open',
    message: shabbat ? 'אני אתר שומר שבת' : manualActive ? row.manual_message || 'האתר בשיפוצים - תכף נחזור' : '',
    activeUntil: shabbat?.endsAt || (manualActive ? row.manual_until : null),
    activeName: shabbat?.name || null,
    manualEnabled: row.manual_enabled,
    manualMessage: row.manual_message || 'האתר בשיפוצים - תכף נחזור',
    manualUntil: row.manual_until,
    shabbatSchedules: schedules,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    await ensureSiteControl();
    const result = await pool.query<SiteControlRow>('SELECT * FROM site_control WHERE id = TRUE LIMIT 1');
    return NextResponse.json(publicState(result.rows[0]));
  } catch (error) {
    console.error('site-control GET failed', error);
    return NextResponse.json({
      active: false,
      mode: 'open',
      message: '',
      error: 'site-control unavailable',
    });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isDashboardRequest(request)) {
      return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
    }

    await ensureSiteControl();
    const body = await request.json().catch(() => ({})) as {
      manualEnabled?: boolean;
      manualMessage?: string;
      manualUntil?: string | null;
      shabbatSchedules?: ShabbatWindow[];
    };

    const current = await pool.query<SiteControlRow>('SELECT * FROM site_control WHERE id = TRUE LIMIT 1');
    const currentState = publicState(current.rows[0]);
    const schedules = Array.isArray(body.shabbatSchedules) ? body.shabbatSchedules : currentState.shabbatSchedules;

    const cleanSchedules = schedules
      .filter((item) => item && item.startsAt && item.endsAt)
      .map((item) => ({
        id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: String(item.name || 'שבת').trim() || 'שבת',
        startsAt: item.startsAt,
        endsAt: item.endsAt,
      }));

    const result = await pool.query<SiteControlRow>(
      `UPDATE site_control
       SET manual_enabled = $1,
           manual_message = $2,
           manual_until = $3,
           shabbat_schedules = $4::jsonb,
           updated_at = NOW()
       WHERE id = TRUE
       RETURNING *`,
      [
        typeof body.manualEnabled === 'boolean' ? body.manualEnabled : currentState.manualEnabled,
        body.manualMessage ?? currentState.manualMessage,
        body.manualUntil === undefined ? currentState.manualUntil : body.manualUntil || null,
        JSON.stringify(cleanSchedules),
      ]
    );

    return NextResponse.json(publicState(result.rows[0]));
  } catch (error) {
    console.error('site-control PATCH failed', error);
    return NextResponse.json({ error: 'שגיאת שרת. נסה שוב מאוחר יותר.' }, { status: 500 });
  }
}
