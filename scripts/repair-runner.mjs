import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const jobId = process.env.REPAIR_JOB_ID;
const prompt = process.env.REPAIR_PROMPT || '';
const dashboardUrl = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
const automationSecret = process.env.AUTOMATION_API_SECRET || '';
const repository = process.env.GITHUB_REPOSITORY || 'hatbaot2554-hue/masoret-dashboard';
const runId = process.env.GITHUB_RUN_ID || '';
const openAiKey = process.env.OPENAI_API_KEY || '';
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const aiRepairMode = process.env.AI_REPAIR_MODE || 'branch';
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
    return { name, ok: true, output: output.slice(-3000), command, cwd };
  } catch (error) {
    const detail = `${error.stdout || ''}\n${error.stderr || ''}`.trim().slice(-3000);
    await postLog(`הבדיקה "${name}" נכשלה. אני קורא את הפלט כדי לבודד את מקור התקלה.`, 'error');
    if (detail) await postLog(`פלט אחרון מהבדיקה "${name}": ${detail}`, 'error');
    return { name, ok: false, output: detail || error.message, command, cwd };
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

function responseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function compactResults(results) {
  return results.map((item) => ({
    name: item.name,
    ok: item.ok,
    command: item.command,
    output: String(item.output || '').slice(-1800),
  }));
}

async function askOpenAi(results, failed) {
  if (!openAiKey) {
    await postLog('מנוע OpenAI עדיין לא מחובר לרץ התיקונים. כדי להפעיל אותו צריך להוסיף OPENAI_API_KEY ב-GitHub Secrets של masoret-dashboard.', 'warning', failed.length ? 'blocked' : 'running');
    return '';
  }

  await postLog(`מפעיל מנוע AI של OpenAI לניתוח עמוק של הבקשה והבדיקות. מצב עבודה: ${aiRepairMode}.`, 'info', 'running');
  const input = [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: 'אתה מנוע אבחון ותיקון לאתר מסחר ולוח בקרה. ענה בעברית פשוטה. אל תחשוף סודות. נתח לוגים, אתר מקור בעיה, ותן צעדי תיקון מדויקים. אם חסרה הרשאה או סוד, כתוב בדיוק מה חסר. אם אפשר לתקן בקוד, הצע קבצים ואזורים לשינוי. אל תמציא שהפעלת תיקון אם לא בוצע בפועל.',
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: JSON.stringify({
            repairRequest: prompt,
            mode: aiRepairMode,
            baselineDiagnosis: failed.length ? diagnosisFromFailures(failed) : 'all baseline checks passed',
            results: compactResults(results),
          }, null, 2),
        },
      ],
    },
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${openAiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: openAiModel,
        input,
        max_output_tokens: 1200,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.error?.message || `OpenAI status ${response.status}`;
      await postLog(`OpenAI לא הצליח לנתח את התקלה: ${detail}`, 'error', failed.length ? 'blocked' : 'running');
      return '';
    }
    const text = responseText(data);
    if (text) {
      await postLog(`ניתוח AI: ${text.slice(0, 1800)}`, failed.length ? 'warning' : 'success', failed.length ? 'blocked' : 'running');
      return text;
    }
    await postLog('OpenAI החזיר תשובה ריקה, לכן נשארים עם האבחון הטכני הרגיל.', 'warning', failed.length ? 'blocked' : 'running');
    return '';
  } catch (error) {
    await postLog(`לא הצלחתי להתחבר ל-OpenAI: ${error instanceof Error ? error.message : String(error)}`, 'error', failed.length ? 'blocked' : 'running');
    return '';
  }
}

function repoInfoForPath(repoPath) {
  const normalized = repoPath.replaceAll('\\', '/');
  if (normalized.includes('/masoret-website')) return { name: 'masoret-website', full: 'hatbaot2554-hue/masoret-website' };
  if (normalized.includes('/masoret-automation')) return { name: 'masoret-automation', full: 'hatbaot2554-hue/masoret-automation' };
  return { name: 'masoret-dashboard', full: 'hatbaot2554-hue/masoret-dashboard' };
}

function likelyFilesFromText(text, repoPath) {
  const files = new Set();
  const patterns = [
    /((?:app|scripts|src|components|lib|pages|\.github)\/[A-Za-z0-9_./[\]-]+\.(?:ts|tsx|js|jsx|mjs|py|yml|yaml|css|json))/g,
    /((?:auto_order|check_status|scrape|sync)[A-Za-z0-9_./-]*\.py)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const file = match[1].replaceAll('\\', '/');
      if (existsSync(join(repoPath, file))) files.add(file);
    }
  }
  for (const fallback of ['package.json', 'next.config.mjs', 'app/page.tsx', 'scripts/repair-runner.mjs']) {
    if (files.size >= 5) break;
    if (existsSync(join(repoPath, fallback))) files.add(fallback);
  }
  return [...files].slice(0, 5);
}

function readContextFiles(repoPath, files) {
  return files.map((file) => {
    const full = join(repoPath, file);
    let content = '';
    try {
      content = readFileSync(full, 'utf8').slice(0, 14000);
    } catch {
      content = '';
    }
    return { path: file, content };
  }).filter((item) => item.content);
}

function extractDiff(text) {
  const fenced = text.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/^diff --git |^--- /m);
  return start >= 0 ? raw.slice(start).trim() : '';
}

async function askOpenAiPatch(failedItem) {
  if (!openAiKey) return '';
  const files = likelyFilesFromText(`${prompt}\n${failedItem.output}`, failedItem.cwd);
  const contextFiles = readContextFiles(failedItem.cwd, files);
  if (!contextFiles.length) {
    await postLog('ה-AI לא קיבל מספיק קבצים רלוונטיים כדי להכין תיקון קוד בטוח.', 'warning', 'blocked');
    return '';
  }

  await postLog(`מוסר ל-OpenAI קבצים רלוונטיים להכנת תיקון: ${contextFiles.map((item) => item.path).join(', ')}.`, 'info', 'running');
  const input = [
    {
      role: 'system',
      content: [{
        type: 'input_text',
        text: [
          'אתה מתקן קוד במאגר אמיתי.',
          'החזר רק unified diff תקין שאפשר להריץ עליו git apply.',
          'אל תחזיר הסברים מחוץ ל-diff.',
          'אל תשנה סודות, אל תוסיף מפתחות, ואל תעשה שינוי רחב אם אין מספיק מידע.',
          'אם אין דרך בטוחה לתקן, החזר טקסט קצר: NO_SAFE_PATCH.',
        ].join('\n'),
      }],
    },
    {
      role: 'user',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          request: prompt,
          failingCheck: {
            name: failedItem.name,
            command: failedItem.command,
            output: String(failedItem.output || '').slice(-5000),
          },
          files: contextFiles,
        }, null, 2),
      }],
    },
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${openAiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: openAiModel, input, max_output_tokens: 4000 }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      await postLog(`OpenAI לא הצליח להכין patch: ${data?.error?.message || response.status}`, 'error', 'blocked');
      return '';
    }
    const text = responseText(data);
    if (/NO_SAFE_PATCH/i.test(text)) {
      await postLog('OpenAI קבע שאין תיקון קוד בטוח עם המידע הנוכחי.', 'warning', 'blocked');
      return '';
    }
    return extractDiff(text);
  } catch (error) {
    await postLog(`שגיאה בהכנת תיקון AI: ${error instanceof Error ? error.message : String(error)}`, 'error', 'blocked');
    return '';
  }
}

async function createPullRequest(repoFull, branch, title, body) {
  const token = process.env.GITHUB_REPAIR_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) return '';
  try {
    const response = await fetch(`https://api.github.com/repos/${repoFull}/pulls`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title, head: branch, base: 'main', body }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      await postLog(`התיקון נדחף לענף ${branch}, אבל פתיחת Pull Request נכשלה: ${data?.message || response.status}`, 'warning', 'blocked');
      return '';
    }
    return data?.html_url || '';
  } catch (error) {
    await postLog(`התיקון נדחף לענף ${branch}, אבל פתיחת Pull Request נכשלה: ${error instanceof Error ? error.message : String(error)}`, 'warning', 'blocked');
    return '';
  }
}

async function tryAiCodeRepair(failedItem) {
  if (!openAiKey) return '';
  if (!['branch', 'patch', 'auto'].includes(aiRepairMode)) {
    await postLog('מצב AI מוגדר לניתוח בלבד, לכן לא אנסה לשנות קוד.', 'info', 'blocked');
    return '';
  }

  const repo = repoInfoForPath(failedItem.cwd);
  await postLog(`מתחיל ניסיון תיקון קוד AI במאגר ${repo.name}.`, 'info', 'running');
  const diff = await askOpenAiPatch(failedItem);
  if (!diff) return '';

  const patchPath = join(workDir, `ai-patch-${repo.name}.diff`);
  writeFileSync(patchPath, `${diff}\n`, 'utf8');
  try {
    run(`git apply --check "${patchPath}"`, { cwd: failedItem.cwd, timeout: 60000 });
    run(`git apply "${patchPath}"`, { cwd: failedItem.cwd, timeout: 60000 });
    await postLog('OpenAI הכין patch תקין, והרץ החיל אותו בסביבת הבדיקה.', 'success', 'running');
  } catch (error) {
    await postLog(`OpenAI הכין patch, אבל אי אפשר היה להחיל אותו בבטחה: ${error.stderr || error.message}`, 'error', 'blocked');
    return '';
  }

  const verification = await runCheck(`בדיקת אימות אחרי תיקון AI - ${failedItem.name}`, failedItem.command, failedItem.cwd, 300000);
  if (!verification.ok) {
    await postLog('התיקון של OpenAI לא עבר את בדיקת האימות, לכן הוא לא יפורסם.', 'error', 'blocked');
    return '';
  }

  const branch = `ai-repair-${jobId}-${Date.now()}`;
  try {
    run('git config user.name "Masoret AI Repair"', { cwd: failedItem.cwd });
    run('git config user.email "actions@github.com"', { cwd: failedItem.cwd });
    run(`git checkout -b ${branch}`, { cwd: failedItem.cwd });
    run('git add -A', { cwd: failedItem.cwd });
    run(`git commit -m "AI repair job ${jobId}"`, { cwd: failedItem.cwd });
    run(`git push origin ${branch}`, { cwd: failedItem.cwd, timeout: 180000 });
    const prUrl = await createPullRequest(
      repo.full,
      branch,
      `AI repair job ${jobId}`,
      `נוצר אוטומטית על ידי רץ התיקונים.\n\nבקשה מקורית:\n${prompt}\n\nהבדיקה שעברה אחרי התיקון:\n${failedItem.name}`
    );
    const message = prUrl
      ? `התיקון עבר בדיקות ונפתח Pull Request: ${prUrl}`
      : `התיקון עבר בדיקות ונדחף לענף ${branch}.`;
    await postLog(message, 'success', 'completed', message);
    return message;
  } catch (error) {
    await postLog(`התיקון עבר בדיקה, אבל הפרסום ל-GitHub נכשל: ${error.stderr || error.message}`, 'error', 'blocked');
    return '';
  }
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
  const aiAnalysis = await askOpenAi(results, failed);
  const report = [
    `Repair job #${jobId}`,
    `Prompt: ${prompt}`,
    '',
    ...results.map((item) => `- ${item.ok ? 'OK' : 'FAILED'}: ${item.name}`),
    '',
    failed.length ? `Diagnosis: ${diagnosisFromFailures(failed)}` : 'Diagnosis: all baseline checks passed.',
    '',
    aiAnalysis ? `AI analysis:\n${aiAnalysis}` : 'AI analysis: not available.',
  ].join('\n');
  writeFileSync(join(workDir, 'repair-report.txt'), report, 'utf8');

  if (failed.length) {
    await postLog(`נמצאו ${failed.length} בדיקות שנכשלו. האבחון המרכזי: ${diagnosisFromFailures(failed)}`, 'warning', 'blocked', report);
    const repairResult = await tryAiCodeRepair(failed[0]);
    if (repairResult) return;
    await postLog(openAiKey ? 'מנוע AI מחובר ונתן אבחון, אבל לא הצליח להכין תיקון קוד שעובר בדיקות. במקרה כזה צריך אישור/התערבות ידנית או כלל תיקון ייעודי.' : 'בגרסה הזו הרץ יודע לבדוק ולדווח. כדי שהוא ינתח ויתקן כמו AI צריך להגדיר OPENAI_API_KEY ב-GitHub Secrets.', 'warning', 'blocked');
    return;
  }

  await postLog('כל בדיקות הבסיס הסתיימו בהצלחה. לא נמצא כשל build או תחביר במאגרים שנבדקו.', 'success', 'completed', report);
}

main().catch(async (error) => {
  await postLog(`רץ התיקונים נעצר בגלל שגיאה: ${error instanceof Error ? error.message : String(error)}`, 'error', 'failed');
  process.exit(1);
});
