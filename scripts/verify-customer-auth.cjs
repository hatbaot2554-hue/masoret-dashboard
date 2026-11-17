const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const sign = value => crypto.createHmac('sha256', 'test-only-secret').update(value).digest('base64url');
let row, deliveredCode;
const pool = { async query(sql, values = []) {
  if (sql.startsWith('CREATE')) return {};
  if (sql.startsWith('INSERT')) { row = { digest: values[1], attempts: 0 }; return { rowCount: 1 }; }
  if (sql.startsWith('UPDATE')) {
    if (!row || row.attempts >= 5) return { rows: [] };
    row.attempts++; return { rows: [{ digest: row.digest }] };
  }
  if (sql.startsWith('DELETE')) { const found = row && row.digest === values[1]; if (found) row = null; return { rowCount: found ? 1 : 0 }; }
  throw Error(sql);
} };
const mocks = {
  'next/server': { NextResponse: { json: (data, init = {}) => ({ data, status: init.status || 200 }) } },
  '../../lib/db': { createDbPool: () => pool },
  '../../lib/email': { sendSystemEmail: async (_to, _subject, html) => { deliveredCode = html.match(/<strong>(\d+)<\/strong>/)[1]; return { success: true }; } },
  '../../lib/security': { signDashboardPayload: sign, rateLimit: () => true, clientIp: () => 'test', genericServerError: e => { throw e; } },
  './security': { signDashboardPayload: sign, safeEqual: (a,b) => a === b },
};
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: name => mocks[name] || require(name), Buffer, Date, console });
  return exports;
}
(async () => {
  const { POST } = load('app/api/customer-auth/route.ts');
  const { customerSession } = load('app/lib/customerSession.ts');
  const request = body => ({ json: async () => body });
  assert.equal((await POST(request({ identifier: 'test@example.invalid' }))).data.challenge, true);
  assert.equal((await POST(request({ identifier: 'test@example.invalid', code: 'wrong' }))).status, 401);
  const result = await POST(request({ identifier: 'test@example.invalid', code: deliveredCode }));
  assert.equal(result.status, 200);
  const req = { headers: new Headers({ 'x-customer-token': result.data.token }) };
  assert.equal(customerSession(req, 'test@example.invalid'), true);
  assert.equal(customerSession(req, 'other@example.invalid'), false);
  assert.equal(customerSession({ headers: new Headers({ 'x-customer-token': result.data.token + 'bad' }) }, 'test@example.invalid'), false);
  assert.equal((await POST(request({ identifier: 'test@example.invalid', code: deliveredCode }))).status, 401);
  console.log('PASS: challenge, wrong code, valid login, account binding, tampering, replay. No email sent.');
})().catch(e => { console.error(e); process.exitCode = 1; });
