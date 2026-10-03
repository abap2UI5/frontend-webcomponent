/* The renderer over happy-dom: real views of the demo apps, bindings, wires. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installDom } from './dom.mjs';

installDom();
const { Renderer } = await import('../../src/render/renderer.js');
const registry = (await import('../../src/render/registry.js')).default;
await import('../../src/render/controls/index.js');
const { Model, createDeviceModel } = await import('../../src/bindings/model.js');
const { readWire } = await import('../../src/render/wires.js');
const { TAGS } = await import('../../src/render/webcomponents-tags.js');

function setup(data = {}) {
  const reports = [];
  const events = [];
  const r = new Renderer({ document, registry, report: (x) => reports.push(x), onEvent: (e) => events.push(e) });
  const models = { '': new Model('MAIN', data), device: createDeviceModel(window) };
  const render = (xml, slot = 'MAIN') => {
    const out = r.renderXml(xml, { slot, models });
    const host = document.createElement('div');
    host.append(...out.nodes);
    document.body.appendChild(host);
    return { ...out, host };
  };
  return { render, reports, events, models };
}
const NS = 'xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc" xmlns:core="sap.ui.core" xmlns:form="sap.ui.layout.form"';
const viewOf = (body) => `<mvc:View ${NS}>${body}</mvc:View>`;

for (const file of fs.readdirSync('test/fixtures/views')) {
  test(`renders the demo view ${file} without unsupported controls`, () => {
    const res = JSON.parse(fs.readFileSync(`test/fixtures/views/${file}`, 'utf8'));
    const xml = res.S_FRONT.S_ACTION.T_SYSTEM.find((a) => a[0] === 'VIEW_SLOTS' && a[2] === 'MAIN')[3];
    const { render, reports } = setup(res.MODEL);
    const { host } = render(xml);
    assert.ok(host.querySelector('[data-ui5-control="sap.m.Page"]'));
    assert.deepEqual(reports.filter((x) => x.kind === 'control'), []);
    assert.equal(host.querySelectorAll('.a2u-unsupported').length, 0);
  });
}

test('two-way input: a change writes the model, other bindings follow', () => {
  const { render, models } = setup({ NAME: 'World' });
  const { host } = render(viewOf('<Input value="{/NAME}"/><Text text="Hello {/NAME}!"/>'));
  const input = host.querySelector('ui5-input');
  assert.equal(input.value, 'World');
  input.value = 'Ada';
  input.dispatchEvent(new CustomEvent('change'));
  assert.equal(models[''].data.NAME, 'Ada');
  assert.deepEqual([...models[''].edited.keys()], ['/NAME']);
  assert.equal(host.querySelector('ui5-text').textContent, 'Hello Ada!');
});

test('bound aggregation: one row per entry, re-rendered on a model push', () => {
  const { render, models } = setup({ T: [{ N: 'a' }, { N: 'b' }] });
  const { host } = render(viewOf('<List items="{/T}"><StandardListItem title="{N}"/></List>'));
  assert.deepEqual([...host.querySelectorAll('ui5-li')].map((x) => x.textContent), ['a', 'b']);
  models[''].replace({ T: [{ N: 'x' }, { N: 'y' }, { N: 'z' }] });
  assert.deepEqual([...host.querySelectorAll('ui5-li')].map((x) => x.textContent), ['x', 'y', 'z']);
  models[''].replace({ T: [{ N: 'q' }, { N: 'y' }, { N: 'z' }] });
  assert.equal(host.querySelector('ui5-li').textContent, 'q', 'same rows: updated in place');
});

test('event wires: row args, $source, $parameters, model, literal', () => {
  const { render, events } = setup({ T: [{ ID: 'r0' }, { ID: 'r1' }], X: 7 });
  const { host } = render(viewOf(`<List items="{/T}"><CustomListItem><Button text="go {ID}" press=".eB(['ROW'], \${ID}, \${$source>/text}, \${/X}, 'lit')"/></CustomListItem></List>
    <Input value="v" liveChange=".eB(['LIVE', false, false, false, true, true], \${$parameters>/value})"/>`));
  host.querySelectorAll('ui5-button')[1].dispatchEvent(new CustomEvent('click'));
  assert.deepEqual(events[0].args, ['r1', 'go r1', 7, 'lit']);
  assert.equal(events[0].wire.event, 'ROW');
  const input = host.querySelector('ui5-input');
  input.value = 'typed';
  input.dispatchEvent(new CustomEvent('input'));
  assert.deepEqual(events[1].args, ['typed']);
  assert.deepEqual(events[1].wire.options, { useMainModel: false, queueLast: true, noBusy: true });
});

test('eF wires and expression args over the event', () => {
  const { render, events } = setup({});
  const { host } = render(viewOf(`<HBox id="box"><Button id="b1" text="T" press=".eB(['P'], $event.oSource.oParent.sId, \${$source>/text}.toUpperCase())"/>
    <Button text="close" press=".eF('CONTROL_GLOBAL', 'VIEW_SLOTS', 'destroy', 'POPUP')"/></HBox>`));
  const [b1, b2] = host.querySelectorAll('ui5-button');
  b1.dispatchEvent(new CustomEvent('click'));
  assert.deepEqual(events[0].args, ['box', 'T']);
  b2.dispatchEvent(new CustomEvent('click'));
  assert.equal(events[1].wire.fn, 'eF');
  assert.deepEqual([events[1].wire.action, ...events[1].args], ['CONTROL_GLOBAL', 'VIEW_SLOTS', 'destroy', 'POPUP']);
  assert.equal(readWire(".eBP($event, true, ['X'])").veto, true);
});

test('unknown controls: a visible box, children still rendered, reported once each', () => {
  const { render, reports } = setup({});
  const { host } = render(`<mvc:View ${NS} xmlns:u="sap.ui.unified"><u:Calendar><u:specialDates><Text text="inside"/></u:specialDates></u:Calendar></mvc:View>`);
  const box = host.querySelector('.a2u-unsupported');
  assert.equal(box.getAttribute('data-a2u-unsupported'), 'sap.ui.unified.Calendar');
  assert.match(box.textContent, /unsupported control sap\.ui\.unified\.Calendar/);
  assert.equal(box.querySelector('ui5-text').textContent, 'inside');
  assert.deepEqual(reports.filter((r) => r.kind === 'control').map((r) => r.detail), ['sap.ui.unified.Calendar']);
});

test('SimpleForm: Label opens a row, Title a group', () => {
  const { render } = setup({});
  const { host } = render(viewOf('<form:SimpleForm><form:content><core:Title text="G1"/><Label text="L1"/><Input/><Input/><Label text="L2"/><Text text="t"/></form:content></form:SimpleForm>'));
  const grid = host.querySelector('.a2u-form-grid');
  assert.deepEqual([...grid.children].map((c) => c.className.split(' ').find((x) => x.startsWith('a2u-form'))), ['a2u-form-group-title', 'a2u-form-label', 'a2u-form-fields', 'a2u-form-label', 'a2u-form-fields']);
  assert.equal(grid.children[2].children.length, 2);
});

test('Table: header cells, rows with keys, MultiSelect fed by the selected binding', () => {
  const { render, models } = setup({ T: [{ A: 1, S: false }, { A: 2, S: true }] });
  const { host } = render(viewOf('<Table items="{/T}" mode="MultiSelect"><columns><Column><Text text="A"/></Column></columns><items><ColumnListItem selected="{S}"><cells><Text text="{A}"/></cells></ColumnListItem></items></Table>'));
  assert.equal(host.querySelectorAll('ui5-table-header-cell').length, 1);
  const rows = host.querySelectorAll('ui5-table-row');
  assert.deepEqual([...rows].map((r) => r.getAttribute('row-key')), ['0', '1']);
  const feature = host.querySelector('ui5-table-selection-multi');
  assert.equal(feature.selected, '1');
  feature.selected = '0 1';
  feature.dispatchEvent(new CustomEvent('change'));
  assert.equal(models[''].data.T[0].S, true);
  assert.deepEqual([...models[''].edited.keys()], ['/T/0/S']);
});

test('Select: options from core:Item, selectedKey two-way', () => {
  const { render, models } = setup({ K: 'b', L: [{ K: 'a', T: 'A' }, { K: 'b', T: 'B' }] });
  const { host } = render(viewOf('<Select selectedKey="{/K}" items="{/L}"><core:Item key="{K}" text="{T}"/></Select>'));
  const opts = host.querySelectorAll('ui5-option');
  assert.deepEqual([...opts].map((o) => [o.getAttribute('value'), o.textContent, !!o.selected]), [['a', 'A', false], ['b', 'B', true]]);
  const sel = host.querySelector('ui5-select');
  Object.defineProperty(sel, 'selectedOption', { value: opts[0], configurable: true });
  sel.dispatchEvent(new CustomEvent('change', { detail: { selectedOption: opts[0] } }));
  assert.equal(models[''].data.K, 'a');
});

test('DatePicker: dateValue from a profile formatter becomes value in the valueFormat', () => {
  const { render, models, reports } = setup({ D: '20261003', E: '00000000' });
  const { host } = render(viewOf(`
    <DatePicker dateValue="{ path: '/D', formatter: 'Formatter.DateAbapDateToDateObject' }" valueFormat="dd.MM.yyyy"/>
    <DatePicker dateValue="{ path: '/D', formatter: 'Formatter.DateAbapDateToDateObject' }"
                minDate="{ path: '/D', formatter: 'Formatter.DateAbapDateToDateObject' }"/>
    <DatePicker dateValue="{ path: '/E', formatter: 'Formatter.DateAbapDateToDateObject' }"/>`));
  const [a, b, c] = host.querySelectorAll('ui5-date-picker');
  assert.equal(a.value, '03.10.2026');
  assert.equal(b.value, '2026-10-03');
  assert.equal(b.getAttribute('value-format'), 'yyyy-MM-dd');
  assert.equal(b.getAttribute('min-date'), '2026-10-03');
  assert.equal(c.value, '');
  assert.deepEqual(reports.filter((x) => x.kind === 'formatter'), []);
  models[''].set('/D', '20251224');
  assert.equal(a.value, '24.12.2025');
});

test('growing: the first growingThreshold rows, More renders the next ones (Table and List)', () => {
  const T = Array.from({ length: 7 }, (_, i) => ({ N: `row ${i}` }));
  const { render, models } = setup({ T });
  const { host } = render(viewOf(`
    <Table items="{/T}" growing="true" growingThreshold="3" growingTriggerText="More rows">
      <columns><Column><Text text="N"/></Column></columns>
      <items><ColumnListItem><cells><Text text="{N}"/></cells></ColumnListItem></items>
    </Table>
    <List items="{/T}" growing="true" growingThreshold="5"><StandardListItem title="{N}"/></List>
    <List items="{/T}"><StandardListItem title="{N}"/></List>`));
  const table = host.querySelector('ui5-table');
  const rows = () => table.querySelectorAll('ui5-table-row').length;
  const more = () => table.querySelector('ui5-table-growing');
  assert.equal(rows(), 3);
  assert.equal(more().getAttribute('text'), 'More rows');
  more().dispatchEvent(new CustomEvent('load-more'));
  assert.equal(rows(), 6);
  more().dispatchEvent(new CustomEvent('load-more'));
  assert.equal(rows(), 7);
  assert.equal(more(), null, 'all rows shown: no trigger');
  const [list, plain] = host.querySelectorAll('ui5-list');
  assert.equal(list.querySelectorAll('ui5-li').length, 5);
  assert.equal(list.getAttribute('growing'), 'Button');
  list.dispatchEvent(new CustomEvent('load-more'));
  assert.equal(list.querySelectorAll('ui5-li').length, 7);
  assert.equal(list.getAttribute('growing'), 'None');
  assert.equal(plain.querySelectorAll('ui5-li').length, 7);
  // a model push with more rows: the trigger comes back
  models[''].replace({ T: [...T, ...T] });
  assert.equal(list.getAttribute('growing'), 'Button');
});

test('control registry: every portable-profile v1 control has a mapper, every tag is imported', () => {
  const profile = JSON.parse(fs.readFileSync('profile/portable-v1.json', 'utf8'));
  const names = Object.keys(profile.controls);
  const missing = names.filter((n) => !registry.get(n));
  assert.deepEqual(missing, []);
  const src = fs.readdirSync('src/render/controls').map((f) => fs.readFileSync(`src/render/controls/${f}`, 'utf8')).join('\n')
    + fs.readFileSync('src/ui/app.js', 'utf8');
  const used = new Set([...src.matchAll(/['"`](ui5-[a-z-]+)['"`]/g)].map((m) => m[1]));
  for (const t of used) assert.ok(TAGS.includes(t), `${t} is used but not imported in src/render/webcomponents.js`);
});

test('webcomponents.js imports the module of every tag in TAGS', () => {
  const imports = fs.readFileSync('src/render/webcomponents.js', 'utf8');
  const modules = {};
  for (const pkg of ['webcomponents', 'webcomponents-fiori']) {
    const manifest = JSON.parse(fs.readFileSync(`node_modules/@ui5/${pkg}/dist/custom-elements.json`, 'utf8'));
    for (const m of manifest.modules) for (const d of m.declarations || []) if (d.tagName) modules[d.tagName] = `@ui5/${pkg}/${m.path}`;
  }
  for (const t of TAGS) assert.ok(imports.includes(`'${modules[t]}'`), `${t}: ${modules[t]} is not imported`);
});
