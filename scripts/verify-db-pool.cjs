const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('app/lib/db.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
let created = 0;
class Pool {
  constructor(options) { this.options = options; created++; }
  on(name, callback) { this.event = name; this.callback = callback; }
}
const context = vm.createContext({
  exports: {}, require: () => ({ Pool }), URL,
  process: { env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://test.invalid/db?sslmode=require' } },
  console: { error() {} },
});
function loadRouteCopy() {
  context.exports = {};
  vm.runInContext(`(function () { ${code}\n})();`, context);
  return context.exports.createDbPool();
}
const first = loadRouteCopy();
assert.equal(loadRouteCopy(), first);
assert.equal(created, 1);
assert.equal(first.options.max, 2);
assert.equal(first.options.idleTimeoutMillis, 10000);
assert.equal(first.options.connectionTimeoutMillis, 10000);
assert.equal(first.event, 'error');
assert.doesNotThrow(() => first.callback(new Error('test')));
console.log('PASS: shared pool across module copies, bounded connections, idle cleanup, error handler. No database accessed.');

