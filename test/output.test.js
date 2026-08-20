const test = require('node:test');
const assert = require('node:assert/strict');
const output = require('../lib/output');

test('stableStringify recursively sorts object keys and preserves array order', () => {
  assert.equal(output.stableStringify({ z: 1, a: { d: 2, b: 1 }, rows: [{ z: 2, a: 1 }] }),
    '{"a":{"b":1,"d":2},"rows":[{"a":1,"z":2}],"z":1}');
  assert.equal(output.OUTPUT_VERSION, 1);
});

test('raw argv output detection covers separated, equals, and glued forms', () => {
  assert.equal(output.requestedFormat(['status', 'x', '-o', 'json'], {}), 'json');
  assert.equal(output.requestedFormat(['status', 'x', '--output=json'], {}), 'json');
  assert.equal(output.requestedFormat(['status', 'x', '-ojson'], {}), 'json');
});
