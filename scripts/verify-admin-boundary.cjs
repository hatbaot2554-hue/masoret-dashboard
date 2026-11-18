const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const environment = { env: { NODE_ENV: 'production', DASHBOARD_AUTH_SECRET: 'local-test-only' } };
const next = { NextResponse: { json: (data, options = {}) => ({ data, status: options.status || 200 }) } };
function load(file, security) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    exports, Buffer, Date, console, process: environment,
    require(name) {
      if (name === 'crypto') return crypto;
      if (name === 'next/server') return next;
      if (name.endsWith('/security')) return security;
      if (name.endsWith('/db')) return { createDbPool: () => ({ query: () => { throw Error('Unexpected database access'); } }) };
      return {};
    },
  });
  return exports;
}
const security = load('app/lib/security.ts');
function request(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { headers: new Headers({ authorization: 'Bearer ' + body + '.' + security.signDashboardPayload(body) }) };
}
(async () => {
  const customer = request({ purpose: 'customer', identifier: 'test@example.invalid', exp: Date.now() + 60000 });
  assert.equal(security.isDashboardRequest(customer), false);
  assert.equal(security.isDashboardRequest(request({ username: 'admin', exp: Date.now() + 60000 })), true);
  assert.equal(security.isDashboardRequest(request({ username: 'admin', exp: Date.now() - 1 })), false);
  for (const [path, methods] of [
    ['contact', ['GET']], ['status-sync', ['POST']],
    ['source-orders/simulate', ['POST']], ['orders/[id]', ['GET', 'PATCH']],
  ]) {
    const route = load('app/api/' + path + '/route.ts', security);
    for (const method of methods) {
      assert.equal((await route[method](customer, { params: { id: 'test-only' } })).status, 401, path + ':' + method);
    }
  }
  console.log('PASS: customer tokens rejected by all five administrative handlers before database access; valid admin accepted; expired admin rejected.');
})().catch(error => { console.error(error); process.exitCode = 1; });
