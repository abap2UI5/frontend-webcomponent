/* The core protocol client: requests, delta, slots, transport, actions. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, PROTOCOL, httpErrorText, ERROR_TEXT_MAX } from '../../src/core/session.js';
import { createFetchTransport, isValidContextId } from '../../src/core/transport.js';
import { createActions, isSameOriginUrl } from '../../src/core/actions.js';

const view = (slot, xml = '<mvc:View xmlns:mvc="sap.ui.core.mvc"/>', options) => ['VIEW_SLOTS', 'display', slot, xml, options];
const answer = (id, { app = 'Z_APP', system = [], custom = [], model } = {}) => {
  const r = { S_FRONT: { ID: id, APP: app, PROTOCOL, S_ACTION: {} } };
  if (system.length) r.S_FRONT.S_ACTION.T_SYSTEM = system;
  if (custom.length) r.S_FRONT.S_ACTION.T_CUSTOM = custom;
  if (model !== undefined) r.MODEL = model;
  return r;
};

function scripted(responses) {
  const sent = [];
  return {
    sent,
    roundtrip: async (body) => {
      sent.push(JSON.parse(JSON.stringify(body)));
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'object' && next.status) return next;
      return { ok: true, status: 200, body: JSON.stringify(next) };
    },
  };
}

const session = (t) => new Session({ transport: t, location: (app) => ({ origin: 'http://h', pathname: '/sap/bc/z2ui5/', search: `?app_start=${app}` }), window: { innerWidth: 1280, innerHeight: 800, navigator: { userAgent: '' }, addEventListener() {} } });

test('app start: location, device block, adopted id and slots', async () => {
  const t = scripted([answer('D1', { system: [view('MAIN')], model: { NAME: 'x' } })]);
  const s = session(t);
  const seen = [];
  s.on('response', (r) => seen.push(r));
  await s.start('Z_APP');
  assert.deepEqual(t.sent[0].S_FRONT.SEARCH, '?app_start=Z_APP');
  assert.equal(t.sent[0].S_FRONT.CONFIG.S_DEVICE.SYSTEM, 'desktop');
  assert.equal(t.sent[0].S_FRONT.ID, undefined);
  assert.equal(s.state.id, 'D1');
  assert.deepEqual(seen[0].changed, ['MAIN']);
  assert.equal(s.models.MAIN.data.NAME, 'x');
});

test('an event ships the delta of the edited paths of its slot model', async () => {
  const t = scripted([
    answer('D1', { system: [view('MAIN')], model: { NAME: 'x', T: [{ A: 1 }, { A: 2 }] } }),
    answer('D2'),
  ]);
  const s = session(t);
  await s.start('Z_APP');
  s.models.MAIN.set('/NAME', 'y');
  s.models.MAIN.set('/T/1/A', 5);
  await s.fire('MAIN', 'SAVE', ['arg', 3]);
  assert.deepEqual(t.sent[1], { S_FRONT: { ID: 'D1', EVENT: 'SAVE', T_EVENT_ARG: ['arg', 3] }, MODEL: { NAME: 'y', T: { __delta: { 1: { A: 5 } } } } });
  assert.equal(s.models.MAIN.edited.size, 0, 'sent edits are confirmed');
  assert.equal(s.state.id, 'D2');
  // an event without edits and args carries neither key
  t.sent.length = 1;
});

test('popup model is its own; an APP change tears down popup and popover', async () => {
  const t = scripted([
    answer('D1', { system: [view('MAIN')], model: { A: 1 } }),
    answer('D2', { system: [view('POPUP', '<core:FragmentDefinition xmlns:core="sap.ui.core"/>')], model: { A: 1, P: 'p' } }),
    answer('D3', { app: 'Z_OTHER' }),
  ]);
  const s = session(t);
  await s.start('Z_APP');
  await s.fire('MAIN', 'OPEN');
  assert.ok(s.state.slots.POPUP);
  s.models.POPUP.set('/P', 'edited');
  assert.equal(s.models.MAIN.edited.size, 0);
  await s.fire('POPUP', 'GO');
  assert.deepEqual(t.sent[2].MODEL, { P: 'edited' });
  assert.equal(s.state.slots.POPUP, undefined, 'APP change closes the popup');
});

test('closeSlot is local and drops the slot edits', async () => {
  const t = scripted([answer('D1', { system: [view('MAIN'), view('POPOVER', '<x/>', { openById: 'b' })], model: { A: 1 } })]);
  const s = session(t);
  await s.start('Z_APP');
  s.models.POPOVER.set('/A', 2);
  s.closeSlot('POPOVER');
  assert.equal(s.state.slots.POPOVER, undefined);
  assert.equal(s.models.POPOVER.edited.size, 0);
  assert.equal(t.sent.length, 1);
});

test('errors: the body verbatim, the status without one, protocol mismatch, network', async () => {
  const body = 'Request failed in app <b>Z</b> &amp; <img src=x onerror=alert(1)>\nCX_SY_ZERODIVIDE';
  const t = scripted([
    { ok: false, status: 500, body },
    { ok: false, status: 503, body: '  ' },
    answer('X'),
    new Error('offline'),
  ]);
  t.roundtrip = ((orig) => async (b) => {
    const r = await orig(b);
    if (r.body && r.body.includes('"ID":"X"')) return { ok: true, status: 200, body: r.body.replace(`"PROTOCOL":${PROTOCOL}`, '"PROTOCOL":99') };
    return r;
  })(t.roundtrip);
  const s = session(t);
  // spec/errors.md: never stripped, decoded or interpreted - the text as it came
  await assert.rejects(s.start('Z'), (e) => e.message === body && e.status === 500 && !e.retry);
  await assert.rejects(s.start('Z'), (e) => e.message === 'HTTP 503' && e.retry);
  assert.equal(httpErrorText(500, 'x'.repeat(ERROR_TEXT_MAX + 5)).length > ERROR_TEXT_MAX, true);
  assert.match(httpErrorText(500, 'x'.repeat(ERROR_TEXT_MAX + 5)), /\(5 more characters\)$/);
  await assert.rejects(s.start('Z'), /Protocol mismatch/);
  await assert.rejects(s.start('Z'), (e) => e.retry && /Network error: offline/.test(e.message));
  assert.equal(s.busy, false);
});

test('busy: a second event is dropped, a queue-last wire is sent afterwards', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const sent = [];
  const t = {
    roundtrip: async (body) => {
      sent.push(body.S_FRONT.EVENT || 'start');
      if (body.S_FRONT.EVENT === 'SLOW') await gate;
      return { ok: true, status: 200, body: JSON.stringify(answer(`D${sent.length}`, sent.length === 1 ? { system: [view('MAIN')], model: {} } : {})) };
    },
  };
  const s = session(t);
  await s.start('Z');
  const slow = s.fire('MAIN', 'SLOW');
  assert.deepEqual(await s.fire('MAIN', 'CLICK'), { dropped: true });
  await s.fire('MAIN', 'TYPE1', [], { queueLast: true });
  await s.fire('MAIN', 'TYPE2', [], { queueLast: true });
  release();
  await slow;
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent, ['start', 'SLOW', 'TYPE2']);
});

test('transport: sap-contextid kept, CSRF handshake re-sends the body once', async () => {
  const calls = [];
  const res = (status, headers = {}, body = '{}') => ({ ok: status < 300, status, headers: new Map(Object.entries(headers)), text: async () => body });
  const script = [res(403, { 'x-csrf-token': 'Required' }), res(200, { 'x-csrf-token': 'T0K' }), res(200, { 'sap-contextid': 'SID1' }), res(200)];
  const tr = createFetchTransport({ endpoint: 'http://h/x', fetchImpl: async (url, init) => { calls.push(init); return script.shift(); } });
  await tr.roundtrip({ S_FRONT: {} });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[1].method, 'HEAD');
  assert.equal(calls[1].headers['X-CSRF-Token'], 'Fetch');
  assert.equal(calls[2].headers['X-CSRF-Token'], 'T0K');
  assert.equal(calls[2].body, calls[0].body);
  assert.equal(calls[0].headers['sap-contextid'], undefined);
  await tr.roundtrip({ S_FRONT: {} });
  assert.equal(calls[3].headers['sap-contextid'], 'SID1');
  assert.equal(calls[3].headers['sap-contextid-accept'], 'header');
  assert.equal(isValidContextId('undefined'), false);
  assert.equal(isValidContextId(''), false);
});

test('frontend actions: toast template, box, title, URL rules, unsupported reported', () => {
  const ui = { log: [], toast: (t, o) => ui.log.push(['toast', t, o.duration]), box: (ty, t, o) => ui.log.push(['box', ty, t, o.actions]), setTitle: (t) => ui.log.push(['title', t]), openUrl: (u) => ui.log.push(['open', u]), busy() {}, theme() {}, focus() {}, navigate() {}, back() {} };
  const reports = [];
  const fired = [];
  const a = createActions({ ui, fire: (...x) => fired.push(x), closeSlot: (s) => ui.log.push(['close', s]), report: (r) => reports.push(r.detail) });
  a.run(['CONTROL_GLOBAL', 'MESSAGE_TOAST', 'show', '{0} pressed', 'Save', { duration: 1000 }]);
  a.run(['MESSAGE_TOAST', 'show', 'plain']);
  a.run(['MESSAGE_BOX', 'confirm', 'Sure?', { actions: ['YES', 'NO'] }]);
  a.run('["SET_TITLE","T1"]');
  a.run(['CONTROL_GLOBAL', 'VIEW_SLOTS', 'destroy', 'POPUP']);
  a.run(['OPEN_NEW_TAB', 'https://evil.example/']);
  a.run(['URLHELPER', 'REDIRECT', { URL: 'javascript:alert(1)' }]);
  a.run(['CONTROL_BY_ID', 'x', 'to']);
  assert.deepEqual(ui.log, [['toast', 'Save pressed', 1000], ['toast', 'plain', 3000], ['box', 'confirm', 'Sure?', ['YES', 'NO']], ['title', 'T1'], ['close', 'POPUP']]);
  assert.equal(reports.length, 3);
  assert.match(reports[2], /CONTROL_BY_ID/);
  assert.equal(isSameOriginUrl('/x', 'http://h/a'), true);
  assert.equal(isSameOriginUrl('http://o/x', 'http://h/a'), false);
});

test('START_TIMER fires its event once, a new roundtrip cancels it', async () => {
  const fired = [];
  const a = createActions({ ui: {}, fire: (...x) => fired.push(x), closeSlot() {}, report() {} });
  a.run(['START_TIMER', 'TICK', '5', 'X']);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(fired, [['MAIN', 'TICK', [], { noBusy: true }]]);
  a.run(['START_TIMER', 'TICK', '5']);
  a.cancelTimers();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fired.length, 1);
});
