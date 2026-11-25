const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let used, checkpoint, failInsert, unavailable, statements, released, inserted, existing;
const client = {
  async query(sql, values) {
    statements.push(sql);
    if (sql === 'BEGIN') { checkpoint = used; return {}; }
    if (sql === 'ROLLBACK') { used = checkpoint; return {}; }
    if (sql === 'COMMIT') return {};
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/FROM orders WHERE idempotency_key/.test(sql)) return { rows: existing ? [existing] : [] };
    if (/SELECT \*/.test(sql) && /FROM coupons/.test(sql)) {
      assert.match(sql, /FOR UPDATE/);
      return { rows: unavailable ? [] : [{ id: 1, code: 'TEST', benefit_type: 'fixed', benefit_value: 10, remaining_value: 10 }] };
    }
    if (/UPDATE coupons/.test(sql)) { used++; return { rows: [{ id: 1 }] }; }
    if (/INSERT INTO orders/.test(sql)) {
      if (failInsert) throw Error('simulated insert failure');
      inserted = values;
      existing = { id: 'test-only', idempotency_key: values[16], request_hash: values[17] };
      return { rows: [existing] };
    }
    throw Error('Unexpected transaction query: ' + sql);
  },
  release() { released = true; },
};
const pool = { query: async () => ({ rows: [] }), connect: async () => client };
const response = { NextResponse: { json: (data, options = {}) => ({ data, status: options.status || 200 }) } };
function load(file, coupons) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, console, require(name) {
    if (name === 'next/server') return response;
    if (name === 'crypto') return { default: require('node:crypto') };
    if (name.endsWith('/sharedRateLimit')) return { sharedRateLimit: async () => true };
    if (name.endsWith('/db')) return { createDbPool: () => pool };
    if (name.endsWith('/coupons')) return coupons;
    if (name.endsWith('/security')) return { sharedSecretAllowed: () => true, rateLimit: () => true, clientIp: () => 'test', genericServerError: () => ({ status: 500 }) };
    return {};
  } });
  return exports;
}
const coupons = load('app/lib/coupons.ts');
const route = load('app/api/orders/route.ts', coupons);
async function run(fail, missing = false, retry = false, changed = false) {
  if (!retry) existing = null;
  used = 0; failInsert = fail; unavailable = missing; statements = []; released = false; inserted = null;
  const result = await route.POST({ headers: new Headers({ 'idempotency-key': '00000000-0000-4000-8000-000000000001' }), json: async () => ({ customer_email: 'test@example.invalid', total_price: changed ? 101 : 100, cost_price: 60, profit: 999, shipping_price: 38, coupon: { code: 'TEST' }, items: [] }) });
  assert.equal(released, true);
  return result;
}
(async () => {
  assert.equal((await run(false)).status, 200);
  assert.equal(used, 1);
  assert.equal(inserted[5], 128);
  assert.equal(inserted[7], 68);
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal((await run(false, false, true)).status, 200);
  assert.equal(used, 0);
  assert.equal(inserted, null);
  assert.equal((await run(false, false, true, true)).status, 409);
  assert.equal(inserted, null);
  assert.equal((await run(true)).status, 500);
  assert.equal(used, 0);
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal((await run(false, true)).status, 400);
  assert.equal(inserted, null);
  assert.equal(used, 0);
  console.log('PASS: coupon lock, atomic commit, rollback on order failure, invalid coupon, connection release and server-calculated profit. No database accessed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
