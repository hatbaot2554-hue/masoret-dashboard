import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const jobId = process.env.REPAIR_JOB_ID;
const prompt = process.env.REPAIR_PROMPT || '';
const dashboardUrl = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
const automationSecret = process.env.AUTOMATION_API_SECRET || '';
const repository = process.env.GITHUB_REPOSITORY || 'hatbaot2554-hue/masoret-dashboard';
const runId = process.env.GITHUB_RUN_ID || '';
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
    await postLog(`הבדיקה "${name}" נכשלה. אני קורא את הפלט כדי לבודד את מקור התקלה.`, 'error');
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
  } catch {
    await postLog(`לא הצלחתי לטעון את המאגר ${repo}. בדרך כלל זה אומר שחסרה הרשאת GitHub מתאימה לרץ התיקונים.`, 'error');
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

function diagnosisFromFailures(failed) {
  if (failed.some((item) => /clone|repository|permission|Authentication/i.test(item.output))) {
    return 'נראה שחסרה הרשאת GitHub שמאפשרת לרץ לקרוא את כל המאגרים הרלוונטיים.';
  }
  if (failed.some((item) => /DATABASE_URL|password authentication|self-signed|sslmode|ECONNREFUSED/i.test(item.output))) {
    return 'נראה שהבעיה קשורה לחיבור למסד הנתונים או להגדרת SSL/סביבת מסד.';
  }
  if (failed.some((item) => /Type error|TS\d+|eslint|Failed to compile/i.test(item.output))) {
    return 'נראה שהבעיה נמצאת בקוד עצמו: שגיאת TypeScript, build או lint.';
  }
  if (failed.some((item) => /npm ERR|dependency|package-lock/i.test(item.output))) {
    return 'נראה שהבעיה קשורה להתקנת תלויות או התאמה בין package.json לבין package-lock.';
  }
  return 'נמצא כשל, אבל צריך כלל תיקון ספציפי או מנוע AI מחובר כדי להפוך את האבחון לשינוי קוד אוטומטי.';
}

async function main() {
  if (!jobId) throw new Error('Missing REPAIR_JOB_ID');
  mkdirSync(workDir, { recursive: true });

  await postLog('רץ התיקונים החינמי התחיל לעבוד בתוך GitHub Actions.', 'success', 'running');
  if (runId) {
    await postLog(`אפשר לראות גם את הרצת GitHub המלאה כאן: https://github.com/${repository}/actions/runs/${runId}`, 'info', 'running');
  }
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
    '',
    failed.length ? `Diagnosis: ${diagnosisFromFailures(failed)}` : 'Diagnosis: all baseline checks passed.',
  ].join('\n');
  writeFileSync(join(workDir, 'repair-report.txt'), report, 'utf8');

  if (failed.length) {
    await postLog(`נמצאו ${failed.length} בדיקות שנכשלו. האבחון המרכזי: ${diagnosisFromFailures(failed)}`, 'warning', 'blocked', report);
    await postLog('בגרסה החינמית הזו הרץ יודע לבדוק, לבודד מקור בעיה ולדווח בזמן אמת. כדי שהוא ישנה קוד לבד צריך להוסיף כלל תיקון מוגדר מראש או לחבר מנוע AI עם הרשאת עריכת קוד.', 'warning', 'blocked');
    return;
  }

  await postLog('כל בדיקות הבסיס הסתיימו בהצלחה. לא נמצא כשל build או תחביר במאגרים שנבדקו.', 'success', 'completed', report);
}

main().catch(async (error) => {
  await postLog(`רץ התיקונים נעצר בגלל שגיאה: ${error instanceof Error ? error.message : String(error)}`, 'error', 'failed');
  process.exit(1);
});
