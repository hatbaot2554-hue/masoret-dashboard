const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const counts = new Map();
let fail = false;
const pool = { async query(sql, args) {
  if (fail) throw Error('database unavailable');
  if (!/INSERT INTO/.test(sql)) return { rows: [] };
  assert.match(sql, /ON CONFLICT \(key\) DO UPDATE/);
  assert.match(sql, /resets_at <= NOW\(\)/);
  assert.match(args[0], /^[a-f0-9]{64}$/);
  const hits = (counts.get(args[0]) || 0) + 1;
  counts.set(args[0], hits);
  return { rows: [{ hits }] };
} };
function instance() {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync('app/lib/sharedRateLimit.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { exports, Math, require(name) {
    if (name === 'crypto') return { default: require('node:crypto') };
    if (name === './db') return { createDbPool: () => pool };
    throw Error(name);
  } });
  return exports.sharedRateLimit;
}
(async () => {
  const a = instance(), b = instance();
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b)('test-client', 8, 600000)));
  assert.equal(results.filter(Boolean).length, 8);
  assert.equal(await a('other-client', 8, 600000), true);
  fail = true;
  await assert.rejects(b('test-client', 8, 600000));
  console.log('PASS: separate module instances share database counters; concurrent mocked queries allow eight requests; database outage rejects.');
})().catch(e => { console.error(e); process.exitCode = 1; });
