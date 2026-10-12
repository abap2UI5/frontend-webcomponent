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

test('sanitized HTML: a javascript: URL is refused the way the browser reads it, SVG animate and set go', () => {
  const { render } = setup({
    HTML: '<a id="a1" href="java\tscript:alert(1)">t</a><a id="a2" href="\u0001javascript:alert(1)">c</a>'
      + '<a id="a3" href="JaVaScRiPt:alert(1)">u</a><a id="a4" href="https://abap2ui5.github.io/">ok</a>'
      + '<svg><a id="a5"><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>',
  });
  const { host } = render(viewOf('<FormattedText htmlText="{/HTML}"/>'));
  for (const id of ['a1', 'a2', 'a3']) assert.equal(host.querySelector(`#${id}`).getAttribute('href'), null, id);
  assert.equal(host.querySelector('#a4').getAttribute('href'), 'https://abap2ui5.github.io/');
  assert.equal(host.querySelectorAll('animate, set').length, 0);
});

test('sanitized HTML: custom elements go - no <abap2ui5-app> from backend data starts an app', async () => {
  const { defineElement } = await import('../../src/element.js');
  defineElement('a2u-sanitized-app');
  const { render } = setup({
    HTML: '<p id="p1">text</p><a2u-sanitized-app endpoint="https://example.com/z2ui5" app="Z2UI5_CL_X"></a2u-sanitized-app>'
      + '<abap2ui5-app endpoint="/x" app="Y"></abap2ui5-app><ui5-link href="/x">l</ui5-link><button id="b1" is="a2u-button">b</button>',
  });
  const { host } = render(viewOf('<FormattedText htmlText="{/HTML}"/><core:HTML content="{/HTML}"/>'));
  assert.equal(host.querySelectorAll('a2u-sanitized-app, abap2ui5-app').length, 0);
  // ui5-link is gone from the sanitized markup; the view's own controls stay
  assert.equal([...host.querySelectorAll('ui5-link')].length, 0);
  assert.equal(host.querySelectorAll('#p1').length, 2);
  for (const b of host.querySelectorAll('#b1')) assert.equal(b.getAttribute('is'), null);
});

test('sanitized HTML: <style> goes with its rules - backend markup cannot restyle the view', () => {
  const { render } = setup({
    HTML: '<style>ui5-button { display: none }</style><p id="p1" style="color: red">text</p>'
      + '<svg><style>* { visibility: hidden }</style><text>x</text></svg>',
  });
  const { host } = render(viewOf('<FormattedText htmlText="{/HTML}"/><core:HTML content="{/HTML}"/><Button text="b"/>'));
  assert.equal(host.querySelectorAll('style').length, 0);
  assert.ok(!host.innerHTML.includes('display: none') && !host.innerHTML.includes('visibility'));
  // the style attribute stays, as in UI5's FormattedText whitelist
  const ps = host.querySelectorAll('#p1');
  assert.equal(ps.length, 2);
  for (const p of ps) assert.equal(p.getAttribute('style'), 'color: red');
});

test('Link: an href the browser reads as javascript: is not set', () => {
  const { render } = setup({ URL: 'java\nscript:alert(1)', OK: '/sap/bc/z2ui5' });
  const { host } = render(viewOf('<Link text="a" href="{/URL}"/><Link text="b" href="{/OK}"/>'));
  const [bad, good] = host.querySelectorAll('ui5-link');
  assert.equal(bad.getAttribute('href'), null);
  assert.equal(good.getAttribute('href'), '/sap/bc/z2ui5');
});

test('<abap2ui5-app>: an app attribute set after connecting starts it, once', async () => {
  const { defineElement } = await import('../../src/element.js');
  defineElement('a2u-late-app');
  const calls = [];
  const el = document.createElement('a2u-late-app');
  el.transport = {
    roundtrip: async (body) => {
      calls.push(body);
      return { ok: true, status: 200, body: JSON.stringify({ S_FRONT: { ID: '1', APP: 'Z2UI5_CL_X' } }) };
    },
    endSession() {},
  };
  el.setAttribute('endpoint', '/sap/bc/z2ui5');
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 0);
  el.setAttribute('app', 'Z2UI5_CL_X');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].S_FRONT.SEARCH, '?app_start=Z2UI5_CL_X');
  el.remove();
});

test('<abap2ui5-app>: endpoint and app set together start once; removed before the microtask, nothing starts', async () => {
  const { defineElement } = await import('../../src/element.js');
  defineElement('a2u-late-both');
  const make = (calls) => {
    const el = document.createElement('a2u-late-both');
    el.transport = {
      roundtrip: async (body) => {
        calls.push(body);
        return { ok: true, status: 200, body: JSON.stringify({ S_FRONT: { ID: '1', APP: 'Z2UI5_CL_X' } }) };
      },
      endSession() {},
    };
    document.body.appendChild(el);
    return el;
  };
  const both = [];
  const a = make(both);
  a.setAttribute('endpoint', '/sap/bc/z2ui5');
  a.setAttribute('app', 'Z2UI5_CL_X');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(both.length, 1);
  a.remove();
  const gone = [];
  const b = make(gone);
  b.setAttribute('endpoint', '/sap/bc/z2ui5');
  b.setAttribute('app', 'Z2UI5_CL_X');
  b.remove();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gone.length, 0);
});

test('sanitized HTML keeps relative, mailto:, tel: and data:image URLs', async () => {
  const { isScriptUrl } = await import('../../src/render/controls/common.js');
  for (const ok of ['docs/page.html', '/sap/bc/z2ui5?x=1', '#top', 'javascript-guide.html', 'mailto:a@b.example', 'tel:+4930123', 'data:image/png;base64,AAAA', 'https://abap2ui5.github.io/']) {
    assert.equal(isScriptUrl(ok), false, ok);
  }
  for (const bad of ['javascript:x', ' JAVASCRIPT:x', 'java\tscript:x', '\u0000javascript:x', 'vbscript:x', 'data:text/html,<b>x</b>', 'data: text/html,x']) {
    assert.equal(isScriptUrl(bad), true, JSON.stringify(bad));
  }
});

test('Tree: rebuilt when the structure changes, not when a title of the same length does', () => {
  const { render, models } = setup({ T: [{ TITLE: 'A', KIDS: [{ TITLE: 'x', KIDS: [] }] }, { TITLE: 'B', KIDS: [] }] });
  const { host } = render(viewOf('<Tree items="{/T}"><StandardTreeItem title="{TITLE}"/></Tree>'));
  const titles = () => [...host.querySelectorAll('ui5-tree-item')].map((x) => x.getAttribute('text'));
  assert.deepEqual(titles(), ['A', 'x', 'B']);
  assert.equal(host.querySelector('ui5-tree-item').querySelector('ui5-tree-item').getAttribute('text'), 'x', 'nested under A');
  const first = host.querySelector('ui5-tree-item');
  models[''].replace({ T: [{ TITLE: 'C', KIDS: [{ TITLE: 'y', KIDS: [] }] }, { TITLE: 'B', KIDS: [] }] });
  assert.deepEqual(titles(), ['C', 'y', 'B']);
  assert.equal(host.querySelector('ui5-tree-item'), first, 'same structure: refreshed in place');
  // the same JSON length, another structure: the child moved from A to B
  models[''].replace({ T: [{ TITLE: 'C', KIDS: [] }, { TITLE: 'B', KIDS: [{ TITLE: 'y', KIDS: [] }] }] });
  assert.deepEqual(titles(), ['C', 'B', 'y']);
  assert.equal(host.querySelectorAll('ui5-tree-item')[1].querySelector('ui5-tree-item').getAttribute('text'), 'y', 'nested under B');
});

test('busy and blocked: a busy control sits in an active ui5-busy-indicator', () => {
  const { render, models } = setup({ BUSY: true, BLOCKED: false });
  const { host, ids } = render(viewOf('<Table id="t" busy="{/BUSY}" busyIndicatorDelay="0"/><Button id="b" blocked="{/BLOCKED}" text="x"/>'));
  const wrap = host.querySelector('ui5-busy-indicator');
  assert.ok(wrap, 'the wrapper');
  assert.equal(wrap.hasAttribute('active'), true);
  assert.equal(wrap.getAttribute('delay'), '0');
  assert.ok(wrap.querySelector('ui5-table'));
  assert.equal(ids.get('t').classList.contains('a2u-table'), true, 'the id names the control, not the wrapper');
  const b = host.querySelector('ui5-button');
  assert.equal(b.classList.contains('a2u-blocked'), false);
  models[''].replace({ BUSY: false, BLOCKED: true });
  assert.equal(wrap.hasAttribute('active'), false);
  assert.equal(b.classList.contains('a2u-blocked'), true);
});

test('element binding of a named model moves that model\'s context only', () => {
  const { render } = setup({ NAME: 'n' });
  const { host } = render(viewOf('<VBox binding="{device>/system}"><Text text="{device>phone}"/><Text text="{/NAME}"/></VBox>'));
  const [phone, name] = host.querySelectorAll('ui5-text');
  assert.equal(phone.textContent, 'false');
  assert.equal(name.textContent, 'n');
});

test('the mappers\' own texts follow the renderer\'s language', async () => {
  const { textsFor } = await import('../../src/ui/texts.js');
  const r = new Renderer({ document, registry, report() {}, onEvent() {}, texts: textsFor('de') });
  const models = { '': new Model('MAIN', {}), device: createDeviceModel(window) };
  const { nodes } = r.renderXml(viewOf('<SearchField/><List/><Page/><foo:Bar xmlns:foo="x.y"/>'), { slot: 'MAIN', models });
  const host = document.createElement('div');
  host.append(...nodes);
  assert.equal(host.querySelector('ui5-input').getAttribute('placeholder'), 'Suchen');
  assert.equal(host.querySelector('ui5-list').getAttribute('no-data-text'), 'Keine Daten');
  assert.equal(host.querySelector('.a2u-nav-back').getAttribute('tooltip'), 'Zurück');
  assert.match(host.querySelector('.a2u-unsupported').textContent, /nicht unterstütztes Control x\.y\.Bar/);
});

test('Avatar: an image source is checked like Image\'s', () => {
  const { render } = setup({ BAD: 'javascript:alert(1)', OK: 'https://h/a.png' });
  const { host } = render(viewOf('<Avatar src="{/BAD}"/><Avatar src="{/OK}"/>'));
  const [bad, good] = host.querySelectorAll('ui5-avatar');
  assert.equal(bad.querySelector('img'), null);
  assert.equal(good.querySelector('img').getAttribute('src'), 'https://h/a.png');
});

test('the error dialog: Retry for a retryable error, one dialog at a time, gone on close', async () => {
  const { FrontendApp } = await import('../../src/ui/app.js');
  const { ProtocolError } = await import('../../src/core/session.js');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = new FrontendApp({ root, host: root, endpoint: '/sap/bc/z2ui5', transport: { roundtrip: async () => ({ ok: true, status: 200, body: '{"S_FRONT":{"ID":"1","APP":"Z"}}' }), endSession() {} }, language: 'de' });
  app.session.lastRequest = { S_FRONT: {} };
  app.showError(new ProtocolError('HTTP 503', { status: 503, retry: true }));
  app.showError(new ProtocolError('boom', { status: 500 }));
  const dialogs = root.querySelectorAll('.a2u-error');
  assert.equal(dialogs.length, 1, 'the newer error replaces the older dialog');
  assert.deepEqual([...dialogs[0].querySelectorAll('ui5-button')].map((b) => b.textContent), ['Neu starten', 'Schließen']);
  dialogs[0].dispatchEvent(new CustomEvent('close'));
  assert.equal(root.querySelectorAll('.a2u-error').length, 0, 'Escape removes it');
  app.showError(new ProtocolError('Network error: offline', { retry: true }));
  assert.deepEqual([...root.querySelectorAll('.a2u-error ui5-button')].map((b) => b.textContent), ['Wiederholen', 'Neu starten', 'Schließen']);
  app.destroy();
  root.remove();
});
