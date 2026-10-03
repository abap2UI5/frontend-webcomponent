import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileProperty, compileAggregation, aggregationRows, splitParts } from '../../src/bindings/binding.js';
import { parseObjectLiteral } from '../../src/bindings/objectsyntax.js';
import { formatValue, parseValue, formatDatePattern, parseDatePattern } from '../../src/bindings/types.js';
import { compileExpression, evaluate } from '../../src/bindings/expression.js';
import { Model, createDeviceModel } from '../../src/bindings/model.js';

const ctxOf = (data, path = '', named = {}) => ({ models: { '': new Model('MAIN', data), ...named }, path });

test('literals, escapes and simple paths', () => {
  assert.equal(compileProperty('plain').get(), 'plain');
  assert.equal(compileProperty('a \\{ b \\}').get(), 'a { b }');
  const b = compileProperty('{/NAME}');
  assert.equal(b.kind, 'path');
  assert.equal(b.get(ctxOf({ NAME: 'x' })), 'x');
  assert.deepEqual(splitParts('{/A} and {B}').map((p) => p.body ?? p.text), ['/A', ' and ', 'B']);
});

test('relative paths resolve against the context path', () => {
  const ctx = ctxOf({ T: [{ ID: 1 }, { ID: 2 }] }, '/T/1');
  assert.equal(compileProperty('{ID}').get(ctx), 2);
  const t = compileProperty('{ID}').target(ctx);
  assert.equal(t.path, '/T/1/ID');
});

test('two-way target writes into the model and the edited set', () => {
  const ctx = ctxOf({ NAME: 'a' });
  const b = compileProperty('{/NAME}');
  const t = b.target(ctx);
  t.model.set(t.path, 'b');
  assert.equal(ctx.models[''].data.NAME, 'b');
  assert.deepEqual([...ctx.models[''].edited], [['/NAME', 'b']]);
});

test('typed bindings format for display and parse back', () => {
  const b = compileProperty("{ type : 'sap.ui.model.type.Integer', path:'/N' }");
  assert.equal(b.kind, 'path');
  assert.equal(b.get(ctxOf({ N: 12345 })), new Intl.NumberFormat().format(12345));
  assert.equal(b.parse('42'), 42);
  const f = compileProperty("{path: '/F', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 2 }}");
  assert.equal(f.get(ctxOf({ F: 1.5 })), new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1.5));
  const d = compileProperty("{path: '/D', type: 'sap.ui.model.type.Date', formatOptions: { pattern: 'dd.MM.yyyy', source: { pattern: 'yyyyMMdd' } }}");
  assert.equal(d.get(ctxOf({ D: '20261003' })), '03.10.2026');
  assert.equal(d.parse('04.10.2026'), '20261004');
});

test('composite parts and currency', () => {
  assert.equal(compileProperty('{/A} %').get(ctxOf({ A: 5 })), '5 %');
  assert.equal(compileProperty("{ parts: [ '/A', '/B' ] }").get(ctxOf({ A: 'x', B: 'y' })), 'x y');
  const c = compileProperty("{ parts: ['/AMOUNT', '/CUR'], type: 'sap.ui.model.type.Currency' }");
  assert.equal(c.get(ctxOf({ AMOUNT: 1234.5, CUR: 'EUR' })), `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5)} EUR`);
});

test('formatters are unsupported: placeholder and an issue', () => {
  const b = compileProperty("{ path: '/X', formatter: '.myFormat' }");
  assert.equal(b.get(ctxOf({ X: 1 })), '[formatter .myFormat]');
  assert.deepEqual(b.issues, [{ kind: 'formatter', detail: '.myFormat' }]);
});

test('expression bindings: profile grammar incl. Math.* and string methods', () => {
  const ctx = ctxOf({ Q: 500, S: 'ab', A: 3, B: 9, T: [1, 2] });
  assert.equal(compileProperty('{= ${/Q} > 400 ? \'big\' : \'small\' }').get(ctx), 'big');
  assert.equal(compileProperty('{= ${/S}.toUpperCase() }').get(ctx), 'AB');
  assert.equal(compileProperty('{= Math.max(${/A}, ${/B}) }').get(ctx), 9);
  assert.equal(compileProperty('{= ${/T}.length === 2 && !${/MISSING} }').get(ctx), true);
  assert.equal(compileProperty('{= 500===${/Q} }').get(ctx), true);
  const bad = compileProperty("{= RegExp('vip', 'i').test(${/S}) }");
  assert.equal(bad.get(ctx), undefined);
  assert.equal(bad.issues[0].kind, 'expression');
  assert.throws(() => compileExpression('alert(1)'), /not in the profile/);
  assert.equal(evaluate(compileExpression("${/X} + '-' + ${/Y}"), (r) => ({ '/X': 'a', '/Y': 'b' })[r]), 'a-b');
});

test('the device> named model', () => {
  const device = createDeviceModel({ innerWidth: 500, innerHeight: 900, navigator: { userAgent: 'Chrome/141', maxTouchPoints: 1 }, ontouchstart: null, addEventListener() {} });
  const ctx = ctxOf({}, '', { device });
  assert.equal(compileProperty('{device>/system/phone}').get(ctx), true);
  assert.equal(compileProperty("{= ${device>/orientation/portrait} ? 'P' : 'L' }").get(ctx), 'P');
  assert.equal(compileProperty('{device>/system/phone}').target(ctx), null, 'one-way');
});

test('aggregation bindings with sorter and paging', () => {
  const agg = compileAggregation("{path: '/T', sorter: { path: 'N', descending: true }, length: 2, templateShareable: false}");
  const { rows } = aggregationRows(agg, ctxOf({ T: [{ N: 1 }, { N: 3 }, { N: 2 }] }));
  assert.deepEqual(rows.map((r) => r.path), ['/T/1', '/T/2']);
  assert.equal(compileAggregation('static'), null);
});

test('object syntax and date patterns', () => {
  assert.deepEqual(parseObjectLiteral("{ a: 'x', b: [1, true], c: { d: null }, f: myFn }"), { a: 'x', b: [1, true], c: { d: null }, f: { $ident: 'myFn' } });
  assert.throws(() => parseObjectLiteral('{ a: }'));
  const d = new Date(2026, 9, 3, 14, 5, 9);
  assert.equal(formatDatePattern(d, "yyyy-MM-dd'T'HH:mm:ss"), '2026-10-03T14:05:09');
  assert.equal(parseDatePattern('141509', 'HHmmss').getMinutes(), 15);
  assert.equal(formatValue('15:18:26', 'sap.ui.model.type.Time', { pattern: 'HH:mm' }), '15:18');
  assert.equal(parseValue('1,234.5', 'sap.ui.model.type.Float'), 1234.5);
});

test('a model push keeps the edits not yet sent', () => {
  const m = new Model('MAIN', { A: 1, B: 1 });
  m.set('/A', 2);
  m.replace({ A: 1, B: 5 });
  assert.deepEqual(m.data, { A: 2, B: 5 });
  m.confirmSent(new Map([['/A', 2]]));
  m.replace({ A: 7 });
  assert.deepEqual(m.data, { A: 7 });
});
