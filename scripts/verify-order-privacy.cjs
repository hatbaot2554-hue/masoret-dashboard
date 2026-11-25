const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
let queries = 0;
const row = { id: 12345, created_at: new Date().toISOString(), customer_email: 'owner@example.invalid', notes: 'PRIVATE', admin_notes: 'STAFF', request_hash: 'SECRET', items: [{ name: 'Book', quantity: 1, cost: 10, engraving: { sketchFile: { dataUrl: 'PRIVATE' } }, sketchFile: { dataUrl: 'PRIVATE' } }] };
function load(path, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, Date, URL, console, process: { env: { NODE_ENV: 'production', DASHBOARD_AUTH_SECRET: 'test-only' } }, require(name) {
    if (name === 'crypto') return crypto;
    if (name === 'next/server') return { NextResponse: { json: (data, opts = {}) => ({ data, status: opts.status || 200 }) } };
    if (name.endsWith('/db')) return { createDbPool: () => ({ query: async () => { queries++; return { rows: [row] }; } }) };
    return deps[name.split('/').at(-1)] || {};
  } });
  return exports;
}
const security = load('app/lib/security.ts');
const customerSession = load('app/lib/customerSession.ts', { security });
const route = load('app/api/orders/route.ts', { security, customerSession });
function request(identifier, expired = false) {
  const headers = new Headers();
  if (identifier) {
    const payload = Buffer.from(JSON.stringify({ purpose: 'customer', identifier, exp: Date.now() + (expired ? -1000 : 60000) })).toString('base64url');
    headers.set('x-customer-token', payload + '.' + security.signDashboardPayload(payload));
  }
  return { url: 'https://example.invalid/api/orders?order=12345&email=owner%40example.invalid', headers };
}
(async () => {
  for (const req of [request(), request('other@example.invalid'), request('owner@example.invalid', true)]) {
    assert.equal((await route.GET(req)).status, 401);
    assert.equal(queries, 0);
  }
  const response = await route.GET(request('owner@example.invalid'));
  assert.equal(response.status, 200);
  assert.equal(response.data.order.items[0].name, 'Book');
  assert.ok(!JSON.stringify(response.data).match(/PRIVATE|STAFF|SECRET|sketchFile|request_hash|cost/));
  console.log('PASS: anonymous, different customer and expired sessions denied before DB; verified owner receives no files, internal notes, cost or request hash.');
})().catch(e => { console.error(e); process.exitCode = 1; });
