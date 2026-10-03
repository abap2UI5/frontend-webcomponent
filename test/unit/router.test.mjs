/* The URL hash: routes, the app-state hash, app-owned hashes, HASH_BACK, embedded events. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router, pageUrl, eventUrl, splitHash, parseRoute, appHashOf, patternFor } from '../../src/core/router.js';
import { Session, PROTOCOL } from '../../src/core/session.js';
import { createActions } from '../../src/core/actions.js';

const hashOfUrl = (url) => (url.includes('#') ? url.slice(url.indexOf('#') + 1) : '');

/* a page: location + History API + hashchange, with the browser's entry list */
function fakeWindow(initial = '') {
  const entries = [initial];
  let pos = 0;
  const listeners = new Set();
  const calls = [];
  const fire = () => listeners.forEach((f) => f());
  return {
    location: { pathname: '/p', search: '?app_start=A', origin: 'http://h', get hash() { return entries[pos] ? `#${entries[pos]}` : ''; } },
    history: {
      state: null,
      pushState(_s, _t, url) { entries.splice(pos + 1); entries.push(hashOfUrl(url)); pos += 1; calls.push(['push', hashOfUrl(url)]); },
      replaceState(_s, _t, url) { entries[pos] = hashOfUrl(url); calls.push(['replace', hashOfUrl(url)]); },
      back() { calls.push(['back']); if (pos > 0) { pos -= 1; fire(); } },
    },
    addEventListener(t, f) { if (t === 'hashchange') listeners.add(f); },
    removeEventListener(t, f) { listeners.delete(f); },
    /* the user edits the URL (a new entry + hashchange) */
    edit(h) { entries.splice(pos + 1); entries.push(h); pos += 1; fire(); },
    entries,
    calls,
    get pos() { return pos; },
  };
}

function setup(win = fakeWindow(), { busy = false } = {}) {
  const seen = { navigate: [], raise: [] };
  const state = { busy };
  const router = new Router({
    url: pageUrl(win),
    navigate: (h) => seen.navigate.push(h),
    raise: (e, h) => seen.raise.push([e, h]),
    isBusy: () => state.busy,
  });
  router.start();
  return { win, router, seen, state };
}

test('hash parsing: shell split, canonical app hash, routes incl. namespaces and stacked slashes', () => {
  assert.deepEqual(splitHash('#/app/X/1'), { shell: '', app: '/app/X/1' });
  assert.deepEqual(splitHash('#SO-act&/app/X/1'), { shell: 'SO-act', app: '/app/X/1' });
  assert.deepEqual(splitHash('SO-act&//app/X'), { shell: 'SO-act', app: '/app/X' });
  assert.deepEqual(splitHash('/a?b=&/c'), { shell: '', app: '/a?b=&/c' }, 'an app hash may contain &/');
  assert.equal(appHashOf('#/'), '');
  assert.equal(appHashOf('detail'), '/detail');
  assert.equal(patternFor('Z_A', 'D1'), '/app/Z_A/D1');
  assert.deepEqual(parseRoute('#/app/Z_A/D1'), { app: 'Z_A', draft: 'D1' });
  assert.deepEqual(parseRoute('#//app/Z_A'), { app: 'Z_A', draft: '' });
  assert.deepEqual(parseRoute('#/app//NS/CL_X/D9'), { app: '/NS/CL_X', draft: 'D9' });
  assert.deepEqual(parseRoute('#SO-act&/app/Z_A/D1?x=1'), { app: 'Z_A', draft: 'D1' });
  assert.equal(parseRoute('#/z2ui5-xapp-state=D1'), null);
  assert.equal(parseRoute('#/detail'), null);
});

test('KEEP: the route follows every draft id, without a history entry', () => {
  const { win, router } = setup();
  router.sync({ setNavRouting: 'KEEP' }, { id: 'D1', app: 'Z_A' });
  assert.equal(win.location.hash, '#/app/Z_A/D1');
  router.sync({}, { id: 'D2', app: 'Z_A' });
  assert.equal(win.location.hash, '#/app/Z_A/D2');
  assert.equal(win.entries.length, 1);
  assert.equal(router.requestHash(), '#/app/Z_A/D2');
});

test('FRESH routes carry the class only; DEFAULT turns routing off and clears the hash', () => {
  const { win, router } = setup();
  router.sync({ setNavRouting: 'FRESH' }, { id: 'D1', app: 'Z_A' });
  assert.equal(win.location.hash, '#/app/Z_A');
  router.sync({ setNavRouting: 'DEFAULT' }, { id: 'D2', app: 'Z_B' });
  assert.equal(win.location.hash, '');
  assert.equal(router.requestHash(), undefined);
});

test('a routed nav_app_call repoints the caller entry, pushes the callee; Back restores the caller', () => {
  const { win, router, seen } = setup();
  router.sync({ setNavRouting: 'KEEP' }, { id: 'D1', app: 'Z_A' });
  router.sync({ setNavRouting: 'KEEP', checkNavAppCall: true, navAppCallPrevApp: 'Z_A', navAppCallPrevId: 'P1' }, { id: 'D3', app: 'Z_B' });
  assert.deepEqual(win.entries, ['/app/Z_A/P1', '/app/Z_B/D3']);
  win.history.back();
  assert.deepEqual(seen.navigate, ['#/app/Z_A/P1']);
  // the answer to the restore adopts the route: no write, the forward entry stays
  const before = win.calls.length;
  router.sync({ setNavRouting: 'KEEP' }, { id: 'D4', app: 'Z_A' });
  assert.equal(win.calls.length, before);
  assert.equal(win.entries.length, 2);
  // a plain response afterwards follows the new id again
  router.sync({}, { id: 'D5', app: 'Z_A' });
  assert.equal(win.location.hash, '#/app/Z_A/D5');
});

test('the hash of the state on screen restores nothing; a change during a roundtrip waits for its end', () => {
  const { win, router, seen, state } = setup();
  router.sync({ setNavRouting: 'KEEP' }, { id: 'D1', app: 'Z_A' });
  win.edit('/app/Z_A/D1');
  assert.deepEqual(seen.navigate, []);
  state.busy = true;
  win.edit('/app/Z_A/OLD');
  assert.deepEqual(seen.navigate, []);
  state.busy = false;
  router.idle();
  assert.deepEqual(seen.navigate, ['#/app/Z_A/OLD']);
});

test('app state: setAppStateActive writes #/z2ui5-xapp-state=<ID>, a response without it clears it', () => {
  const { win, router } = setup();
  router.sync({ setAppStateActive: true }, { id: 'D7', app: 'Z_A' });
  assert.equal(win.location.hash, '#/z2ui5-xapp-state=D7');
  router.sync({}, { id: 'D8', app: 'Z_A' });
  assert.equal(win.location.hash, '');
});

test('app-owned hash: the listener event on a change from outside, pushes and replaces, HASH_BACK', () => {
  const { win, router, seen, state } = setup(fakeWindow('/detail'));
  router.sync({ setHashEvent: 'HASH_CHANGED' }, { id: 'D1', app: 'Z_A' });
  assert.equal(win.location.hash, '#/detail', 'the listener owns the hash: no cleanup');
  router.sync({ setPushState: '/detail/b' }, { id: 'D2', app: 'Z_A' });
  assert.deepEqual(win.entries, ['/detail', '/detail/b']);
  router.sync({ setHashReplace: '/detail/c' }, { id: 'D3', app: 'Z_A' });
  assert.deepEqual(win.entries, ['/detail', '/detail/c']);
  assert.deepEqual(seen.raise, [], 'its own writes raise nothing');
  win.history.back();
  assert.deepEqual(seen.raise, [['HASH_CHANGED', '#/detail']]);
  // busy: parked, delivered once the roundtrip ended
  state.busy = true;
  win.edit('/other');
  assert.equal(seen.raise.length, 1);
  state.busy = false;
  router.idle();
  assert.deepEqual(seen.raise[1], ['HASH_CHANGED', '#/other']);
  // the app switch unregisters it
  router.appChanged();
  win.edit('/third');
  assert.equal(seen.raise.length, 2);
});

test('HASH_BACK: one real step back after a push, the fallback route on a cold deep link', () => {
  const cold = setup(fakeWindow('/detail'));
  cold.router.sync({ setHashEvent: 'HC' }, { id: 'D1', app: 'Z_A' });
  cold.router.back('/');
  assert.deepEqual(cold.win.calls.at(-1), ['replace', '/']);
  assert.deepEqual(cold.seen.raise, [['HC', '#/']], 'the fallback is dispatched like a hash change');
  const warm = setup(fakeWindow(''));
  warm.router.sync({ setHashEvent: 'HC' }, { id: 'D1', app: 'Z_A' });
  warm.router.sync({ setPushState: '/detail' }, { id: 'D2', app: 'Z_A' });
  warm.router.back('/');
  assert.deepEqual(warm.win.calls.at(-1), ['back']);
  assert.deepEqual(warm.seen.raise, [['HC', '']]);
  const plain = setup(fakeWindow(''));
  plain.router.back();
  assert.deepEqual(plain.win.calls.at(-1), ['back']);
});

test('a hash_set suffix without a listener is appended to the hash the page has', () => {
  const { win, router } = setup();
  router.sync({ setPushState: '&my-state=x' }, { id: 'D1', app: 'Z_A' });
  assert.deepEqual(win.entries, ['', '&my-state=x']);
});

test('inside the launchpad the shell part of the hash survives every write', () => {
  const { win, router } = setup(fakeWindow('Shell-display&/app/Z_A/D0'));
  router.sync({ setNavRouting: 'KEEP' }, { id: 'D1', app: 'Z_A' });
  assert.equal(win.location.hash, '#Shell-display&/app/Z_A/D1');
  router.sync({ setNavRouting: 'DEFAULT' }, { id: 'D2', app: 'Z_A' });
  assert.equal(win.location.hash, '#Shell-display');
});

test('embedded (eventUrl): writes are events for the host, its own changes come back through set()', () => {
  const events = [];
  const url = eventUrl((d) => events.push(d));
  const seen = [];
  const router = new Router({ url, navigate: (h) => seen.push(h), raise: () => {} });
  router.start();
  router.sync({}, { id: 'D0', app: 'Z_A' });
  assert.deepEqual(events, [], 'nothing to tell while the virtual hash stays empty');
  router.sync({ setNavRouting: 'KEEP' }, { id: 'D1', app: 'Z_A' });
  router.sync({ checkNavAppCall: true, navAppCallPrevApp: 'Z_A', navAppCallPrevId: 'P1' }, { id: 'D2', app: 'Z_B' });
  assert.deepEqual(events, [
    { action: 'replace', hash: '#/app/Z_A/D1' },
    { action: 'replace', hash: '#/app/Z_A/P1' },
    { action: 'push', hash: '#/app/Z_B/D2' },
  ]);
  url.set('#/app/Z_A/P1');
  assert.deepEqual(seen, ['#/app/Z_A/P1']);
  router.back();
  assert.deepEqual(events.at(-1), { action: 'back' });
});

test('session: the hash rides on every request; restore is app-start-shaped', async () => {
  const sent = [];
  const answers = [
    { S_FRONT: { ID: 'D1', APP: 'Z_A', PROTOCOL } },
    { S_FRONT: { ID: 'D2', APP: 'Z_A', PROTOCOL } },
    { S_FRONT: { ID: 'D3', APP: 'Z_A', PROTOCOL } },
  ];
  let hash = '#/app/Z_A/D0';
  const s = new Session({
    transport: { roundtrip: async (b) => { sent.push(JSON.parse(JSON.stringify(b))); return { ok: true, status: 200, body: JSON.stringify(answers.shift()) }; } },
    location: (app) => ({ origin: 'http://h', pathname: '/p', search: `?app_start=${app}` }),
    window: { innerWidth: 1280, innerHeight: 800, navigator: { userAgent: '' }, addEventListener() {} },
    hash: () => hash,
  });
  await s.start('Z_A');
  assert.equal(sent[0].S_FRONT.HASH, '#/app/Z_A/D0');
  s.models.MAIN.set('/X', 1);
  hash = '#/app/Z_A/D1';
  await s.fire('MAIN', 'GO');
  assert.equal(sent[1].S_FRONT.HASH, '#/app/Z_A/D1');
  s.models.MAIN.set('/X', 2);
  await s.restore('#/app/Z_A/OLD');
  const r = sent[2].S_FRONT;
  assert.equal(r.ID, undefined);
  assert.equal(r.HASH, '#/app/Z_A/OLD');
  assert.equal(r.SEARCH, '?app_start=Z_A');
  assert.ok(r.CONFIG && r.CONFIG.S_DEVICE);
  assert.equal(sent[2].MODEL, undefined, 'the edits of the screen being left are not sent');
});

test('actions: HASH_BACK takes its fallback, the ROUTER option names go to the router', () => {
  const calls = [];
  const a = createActions({
    ui: { back: (f) => calls.push(['back', f]), route: (o) => calls.push(['route', o]) },
    fire: () => {},
    closeSlot: () => {},
    report: (d) => calls.push(['report', d.detail]),
  });
  a.run(['HASH_BACK']);
  a.run(['HASH_BACK', '/']);
  a.run(['SET_PUSH_STATE', '/detail']);
  a.run(['HASH_REPLACE', '/detail/b']);
  a.run(['HASH_ATTACH_CHANGED', 'HC']);
  a.run(['SET_NAV_ROUTING', 'KEEP']);
  a.run(['SET_APP_STATE_ACTIVE']);
  a.run(['SET_APP_STATE_ACTIVE', ' ']);
  assert.deepEqual(calls, [
    ['back', undefined],
    ['back', '/'],
    ['route', { setPushState: '/detail' }],
    ['route', { setHashReplace: '/detail/b' }],
    ['route', { setHashEvent: 'HC' }],
    ['route', { setNavRouting: 'KEEP' }],
    ['route', { setAppStateActive: true }],
    ['route', { setAppStateActive: false }],
  ]);
});

test('profile actions: both shapes of portable-v1.json give the wire actions; each one is handled', async () => {
  const fs = await import('node:fs');
  const { profileActions } = await import('../../scripts/profile-actions.mjs');
  const profile = JSON.parse(fs.readFileSync('profile/portable-v1.json', 'utf8'));
  const p = profileActions(profile);
  assert.ok(p.wire.includes('ROUTER') && p.wire.includes('HASH_BACK'));
  assert.ok(!p.wire.includes('SET_PUSH_STATE'), 'a client-API name is no wire action');
  // the split shape (decision Q10): the wire list and the client-API names apart
  const split = profileActions({ frontendActions: {
    wire: ['SET_FOCUS', 'HASH_BACK'], systemActions: ['ROUTER'], routerOptions: ['setPushState'],
    clientApi: ['SET_PUSH_STATE', 'HASH_BACK'], noOpAllowed: ['SET_SIZE_LIMIT'], excluded: ['CONTROL_BY_ID'],
  } });
  assert.deepEqual(split.wire, ['HASH_BACK', 'ROUTER', 'SET_FOCUS']);
  assert.deepEqual(split.clientApi, ['SET_PUSH_STATE']);
  const supported = new Set(createActions({ ui: {}, fire: () => {}, closeSlot: () => {}, report: () => {} }).supported());
  // allowed by the profile, not implemented yet: reported as unsupported when they arrive (README "Limits")
  const NOT_YET = ['DOWNLOAD_B64_FILE', 'KEYBOARD_SHORTCUT', 'PLAY_AUDIO', 'SCROLL_INTO_VIEW', 'SCROLL_TO', 'SET_FAVICON', 'SET_SIZE_LIMIT', 'STORE_DATA', 'SYSTEM_LOGOUT'];
  const missing = p.wire.filter((n) => n !== 'ROUTER' && !supported.has(n));
  assert.deepEqual(missing, NOT_YET.filter((n) => p.wire.includes(n)));
  for (const n of p.excluded.filter((x) => !x.includes(' '))) assert.ok(!supported.has(n), `${n} is excluded from the profile`);
});

test('CONTROL_GLOBAL: every allowed global of the profile is handled', async () => {
  const fs = await import('node:fs');
  const { profileActions } = await import('../../scripts/profile-actions.mjs');
  const p = profileActions(JSON.parse(fs.readFileSync('profile/portable-v1.json', 'utf8')));
  const seen = [];
  const reports = [];
  const ui = new Proxy({}, { get: (_t, k) => (...a) => seen.push([k, ...a]) });
  const a = createActions({ ui, fire: () => {}, closeSlot: (s) => seen.push(['closeSlot', s]), report: (d) => reports.push(d.detail) });
  for (const [target, methods] of Object.entries(p.globals)) {
    for (const m of methods) a.run(['CONTROL_GLOBAL', target, m, target === 'VIEW_SLOTS' ? 'POPUP' : 'text']);
  }
  assert.deepEqual(reports, []);
  assert.ok(seen.some((x) => x[0] === 'announce' && x[1] === 'text'));
});
