import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const jobId = process.env.REPAIR_JOB_ID;
const prompt = process.env.REPAIR_PROMPT || '';
const dashboardUrl = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
const automationSecret = process.env.AUTOMATION_API_SECRET || '';
const workDir = join(process.cwd(), '.repair-workspace');

async function postLog(text, level = 'info', status = 'running', result = '') {
  const line = `[${level}] ${text}`;
  console.log(line);
  if (!jobId || !dashboardUrl || !automationSecret) return;
  try {
    await fetch(`${dashboardUrl}/api/repair-jobs`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-automation-secret': automationSecret,
      },
      body: JSON.stringify({ id: Number(jobId), status, level, message: text, result }),
    });
  } catch (error) {
    console.log(`[warning] failed to post dashboard log: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function run(command, options = {}) {
  return execSync(command, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 180000,
  });
}

async function runCheck(name, command, cwd, timeout = 180000) {
  await postLog(`מתחיל בדיקה: ${name}.`, 'info');
  try {
    const output = run(command, { cwd, timeout });
    await postLog(`הבדיקה "${name}" הסתיימה בהצלחה.`, 'success');
    return { name, ok: true, output: output.slice(-3000) };
  } catch (error) {
    const detail = `${error.stdout || ''}\n${error.stderr || ''}`.trim().slice(-3000);
    await postLog(`הבדיקה "${name}" נכשלה. בודק את הפלט כדי להבין את מקור התקלה.`, 'error');
    if (detail) await postLog(`פלט אחרון מהבדיקה "${name}": ${detail}`, 'error');
    return { name, ok: false, output: detail || error.message };
  }
}

function cloneUrl(repo) {
  const token = process.env.GITHUB_REPAIR_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) return `https://github.com/hatbaot2554-hue/${repo}.git`;
  return `https://x-access-token:${token}@github.com/hatbaot2554-hue/${repo}.git`;
}

async function cloneRepo(repo) {
  const target = join(workDir, repo);
  await postLog(`נכנס למאגר ${repo} ובודק את הקוד שלו.`, 'info');
  try {
    run(`git clone --depth=1 ${cloneUrl(repo)} "${target}"`, { cwd: workDir, timeout: 180000 });
    await postLog(`המאגר ${repo} נטען בהצלחה.`, 'success');
    return target;
  } catch (error) {
    await postLog(`לא הצלחתי לטעון את המאגר ${repo}. ייתכן שחסרה הרשאת GitHub מתאימה.`, 'error');
    return '';
  }
}

function promptDiagnosis() {
  const text = prompt.toLowerCase();
  const areas = [];
  if (/שבת|תחזוקה|maintenance|shabbat/.test(text)) areas.push('מצב שבת/תחזוקה');
  if (/הזמנ|order|חשבונית|invoice/.test(text)) areas.push('הזמנות/חשבוניות');
  if (/תרגום|english|language/.test(text)) areas.push('תרגום ושפה');
  if (/מוצר|קטגור|product|category/.test(text)) areas.push('מוצרים וקטגוריות');
  if (/אבטחה|security|token|secret/.test(text)) areas.push('אבטחה והרשאות');
  return areas.length ? areas.join(', ') : 'בדיקה כללית של האתר ולוח הבקרה';
}

async function main() {
  if (!jobId) throw new Error('Missing REPAIR_JOB_ID');
  mkdirSync(workDir, { recursive: true });

  await postLog('רץ התיקונים החינמי התחיל לעבוד בתוך GitHub Actions.', 'success', 'running');
  await postLog(`קורא את הבקשה שלך ומנסה להבין איפה הבעיה: ${prompt.slice(0, 500) || 'לא נכתב פירוט.'}`, 'info');
  await postLog(`אזורי מערכת חשודים לפי הבקשה: ${promptDiagnosis()}.`, 'info');

  const dashboardPath = process.cwd();
  const results = [];
  results.push(await runCheck('לוח בקרה - התקנת תלויות', 'npm ci', dashboardPath, 240000));
  results.push(await runCheck('לוח בקרה - build', 'npm run build', dashboardPath, 300000));

  const websitePath = await cloneRepo('masoret-website');
  if (websitePath && existsSync(join(websitePath, 'package.json'))) {
    results.push(await runCheck('אתר לקוחות - התקנת תלויות', 'npm ci', websitePath, 240000));
    results.push(await runCheck('אתר לקוחות - build', 'npm run build', websitePath, 300000));
  }

  const automationPath = await cloneRepo('masoret-automation');
  if (automationPath) {
    results.push(await runCheck('אוטומציות Python - בדיקת תחביר', 'python -m compileall .', automationPath, 180000));
  }

  const failed = results.filter((item) => !item.ok);
  const report = [
    `Repair job #${jobId}`,
    `Prompt: ${prompt}`,
    '',
    ...results.map((item) => `- ${item.ok ? 'OK' : 'FAILED'}: ${item.name}`),
  ].join('\n');
  writeFileSync(join(workDir, 'repair-report.txt'), report, 'utf8');

  if (failed.length) {
    await postLog(`נמצאו ${failed.length} בדיקות שנכשלו. בשלב זה הרץ החינמי מבודד את מקור הבעיה ומציג לוג, אבל לא מבצע שינויי קוד אוטומטיים בלי כלל תיקון מוגדר מראש.`, 'warning', 'blocked', report);
    await postLog('כדי להפוך כשל כזה לתיקון אוטומטי, צריך להוסיף כלל תיקון ספציפי או לחבר מנוע AI בתשלום/חיצוני שמותר לו לערוך קוד.', 'warning', 'blocked');
    return;
  }

  await postLog('כל הבדיקות הבסיסיות הסתיימו בהצלחה. לא נמצא כשל build/תחביר במאגרים שנבדקו.', 'success', 'completed', report);
}

main().catch(async (error) => {
  await postLog(`רץ התיקונים נעצר בגלל שגיאה: ${error instanceof Error ? error.message : String(error)}`, 'error', 'failed');
  process.exit(1);
});
