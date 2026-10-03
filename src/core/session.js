/*
 * The core protocol client: one abap2UI5 app session, as the UI5 frontend
 * keeps it per component (core/Server.js, controller/View1.controller.js,
 * core/actions/Slots.js), without any rendering.
 *
 *   start(app)        POST { S_FRONT: { ORIGIN, PATHNAME, SEARCH: '?app_start=<CLASS>' } }
 *   fire(slot, ...)   an eB wire: { S_FRONT: { ID, EVENT, T_EVENT_ARG }, MODEL: <delta> }
 *   closeSlot(slot)   the frontend-only popup/popover close (no roundtrip)
 *   restore(hash)     the app-start-shaped request of a route the URL now
 *                     names (browser Back/Forward under hash routing): no ID,
 *                     the location, CONFIG and the new HASH
 *
 * Each response is folded into the state by the vendored applyResponse
 * (snapshot.mjs): which slot (MAIN, NEST, NEST2, POPUP, POPOVER) holds which
 * view XML, which app owns which model. The models themselves are long-lived
 * Model objects (bindings/model.js) so a model push refreshes bindings in
 * place. The delta is the vendored buildDelta (appclient.mjs) over the
 * paths the two-way bindings edited - exactly what the UI5 frontend ships.
 *
 * Navigation between apps (nav_app_call / nav_app_leave) is the backend's:
 * the app stack lives in the draft, a call or leave answers a MAIN display
 * of another APP. The client follows S_FRONT.APP and keeps the stack of app
 * names it saw for diagnostics (`appStack`).
 *
 * The renderer subscribes with on('response', fn): fn({ state, changed,
 * custom, routerOptions, appChanged, response }) after every adopted
 * response - `changed` lists the slots whose view must be (re)built,
 * `custom` the T_CUSTOM follow-up actions to run once the DOM exists,
 * `routerOptions` the options of the ROUTER system action ({} without one)
 * for the URL sync (core/router.js).
 *
 * A failed roundtrip (non-2xx) is a ProtocolError whose message is the
 * response body VERBATIM (httpErrorText - spec/errors.md: never stripped or
 * decoded; `HTTP <status>` when the body is empty); the UI shows it as text.
 */
import { applyResponse, emptyState, modelKeyOf } from '../vendor/agent/snapshot.mjs';
import { buildDelta } from '../vendor/agent/appclient.mjs';
import { Model, createDeviceModel } from '../bindings/model.js';

export const PROTOCOL = 2;
const MODEL_KEYS = ['MAIN', 'POPUP', 'POPOVER'];
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/* the longest error body shown (spec/errors.md: a frontend MAY shorten a long body) */
export const ERROR_TEXT_MAX = 64 * 1024;

/**
 * The text of a non-2xx answer (spec/errors.md): the body VERBATIM - never
 * stripped, decoded or otherwise read as markup; the status when the body
 * is empty. The caller shows it as text (textContent), never as HTML.
 */
export function httpErrorText(status, body) {
  const s = body === undefined || body === null ? '' : String(body);
  if (!s.trim()) return `HTTP ${status}`;
  return s.length > ERROR_TEXT_MAX ? `${s.slice(0, ERROR_TEXT_MAX)}\n... (${s.length - ERROR_TEXT_MAX} more characters)` : s;
}

export class ProtocolError extends Error {
  constructor(message, { status, retry } = {}) {
    super(message);
    this.name = 'ProtocolError';
    this.status = status;
    this.retry = !!retry;
  }
}

export class Session {
  /**
   * @param {object} o
   * @param {{ roundtrip: Function, endSession?: Function }} o.transport
   * @param {(app: string) => { origin, pathname, search, hash? }} o.location
   * @param {Window} [o.window]  for the device model
   * @param {Function} [o.hash]   () => '#...' | undefined - the hash every request carries as S_FRONT.HASH
   *                                (the router's; an embedded element sends none)
   * @param {boolean} [o.sendHash] shorthand for hash = the page's location.hash
   */
  constructor({ transport, location, window: win, hash, sendHash = false } = {}) {
    this.transport = transport;
    this.location = location;
    this.hashOf = hash || (sendHash ? () => (globalThis.location && globalThis.location.hash) || undefined : () => undefined);
    this.app = null;
    this.state = emptyState();
    this.models = Object.fromEntries(MODEL_KEYS.map((k) => [k, new Model(k)]));
    this.namedModels = { device: createDeviceModel(win) };
    this.busy = false;
    this.queued = null;
    this.appStack = [];
    this.listeners = { response: new Set(), busy: new Set(), error: new Set(), request: new Set() };
    this.lastRequest = null;
    this.lastResponse = null;
    this.roundtrips = 0;
  }

  on(type, fn) {
    this.listeners[type].add(fn);
    return () => this.listeners[type].delete(fn);
  }

  emit(type, payload) {
    for (const fn of [...this.listeners[type]]) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[abap2ui5-wc] ${type} listener failed`, e);
      }
    }
  }

  setBusy(busy, { silent = false } = {}) {
    this.busy = busy;
    this.emit('busy', { busy, silent });
  }

  /** The models a view in `slot` binds against: its own + the named ones. */
  modelsFor(slot) {
    return { '': this.models[modelKeyOf(slot)], ...this.namedModels };
  }

  /** Start an app (the first roundtrip). */
  async start(app) {
    this.app = app;
    this.queued = null;
    const front = await this.startFront(app);
    this.state = emptyState();
    for (const m of Object.values(this.models)) {
      m.edited.clear();
      m.replace({});
    }
    return this.send({ S_FRONT: front }, null);
  }

  /**
   * An app-start-shaped request for a route the URL now names (browser
   * Back/Forward under hash routing, spec/navigation.md "Routes"): no ID,
   * the location, the full CONFIG and the new HASH - the backend restores
   * the draft the route names. The screen stays until the answer replaces
   * it; unsent edits belong to the screen being left and are dropped.
   */
  async restore(hash) {
    this.queued = null;
    const front = await this.startFront(this.app, hash);
    for (const m of Object.values(this.models)) m.edited.clear();
    return this.send({ S_FRONT: front }, null);
  }

  async startFront(app, hash) {
    const where = await this.location(app);
    const front = { ORIGIN: where.origin, PATHNAME: where.pathname, SEARCH: where.search };
    const h = hash !== undefined ? hash : (where.hash !== undefined ? where.hash : this.hashOf());
    if (h) front.HASH = h;
    // the session block on the app start (spec/request.md, CONFIG): the
    // device as S_DEVICE; no S_UI5 - there is no UI5 runtime here
    const device = this.deviceBlock();
    if (device) front.CONFIG = { S_DEVICE: device };
    return front;
  }

  /**
   * Fire an eB wire from a view in `slot`.
   * @param {string} slot   MAIN | NEST | NEST2 | POPUP | POPOVER
   * @param {string} event  the event name
   * @param {Array} args    the computed T_EVENT_ARG
   * @param {object} [flags] { useMainModel, queueLast, noBusy, hash }
   */
  async fire(slot, event, args = [], flags = {}) {
    if (this.busy) {
      if (flags.queueLast) this.queued = { slot, event, args, flags };
      return { dropped: true };
    }
    const key = flags.useMainModel ? 'MAIN' : modelKeyOf(slot);
    const model = this.models[key];
    const body = { S_FRONT: { ID: this.state.id, EVENT: event } };
    if (args && args.length) body.S_FRONT.T_EVENT_ARG = args;
    const hash = flags.hash !== undefined ? flags.hash : this.hashOf();
    if (hash) body.S_FRONT.HASH = hash;
    let sent = null;
    if (model.edited.size) {
      sent = new Map(model.edited);
      body.MODEL = buildDelta([...sent.keys()], model.data);
    }
    return this.send(body, sent ? { model, sent } : null, flags);
  }

  /** S_DEVICE from the device model, in the UI5 frontend's shape. */
  deviceBlock() {
    const d = this.namedModels.device && this.namedModels.device.data;
    if (!d || !d.system) return null;
    const system = d.system.phone ? 'phone' : d.system.tablet ? 'tablet' : d.system.combi ? 'combi' : 'desktop';
    return {
      SYSTEM: system,
      BROWSER: { NAME: d.browser.name, VERSION: d.browser.version },
      OS: { NAME: d.os.name, VERSION: d.os.version },
      SUPPORT: { TOUCH: !!d.support.touch, POINTER: true, RETINA: (globalThis.devicePixelRatio || 1) > 1 },
      ORIENTATION: d.orientation.landscape ? 'landscape' : 'portrait',
      RESIZE: { WIDTH: d.resize.width, HEIGHT: d.resize.height },
    };
  }

  /** Close a popup/popover locally: the slot goes, its unsent edits with it. */
  closeSlot(slot) {
    if (!this.state.slots[slot]) return;
    const next = { ...this.state, slots: { ...this.state.slots }, models: { ...this.state.models }, custom: [] };
    delete next.slots[slot];
    if (slot === 'POPUP' || slot === 'POPOVER') {
      delete next.models[slot];
      this.models[slot].edited.clear();
    }
    this.state = next;
    this.emit('response', { state: next, changed: [slot], custom: [], response: null, local: true });
  }

  async send(body, carried, flags = {}) {
    this.setBusy(true, { silent: !!flags.noBusy });
    this.lastRequest = body;
    this.emit('request', body);
    let res;
    try {
      try {
        res = await this.transport.roundtrip(body);
      } catch (e) {
        throw new ProtocolError(`Network error: ${(e && e.message) || e}`, { retry: true });
      }
      if (!res.ok) throw new ProtocolError(httpErrorText(res.status, res.body), { status: res.status, retry: res.status >= 502 });
      let json;
      try {
        json = JSON.parse(res.body);
      } catch (e) {
        throw new ProtocolError(`Invalid JSON response: ${e.message}`);
      }
      if (!json || !json.S_FRONT) throw new ProtocolError('Invalid response: missing S_FRONT');
      if (json.S_FRONT.PROTOCOL !== undefined && json.S_FRONT.PROTOCOL !== PROTOCOL) {
        throw new ProtocolError(`Protocol mismatch: this frontend speaks ${PROTOCOL}, the backend answered ${json.S_FRONT.PROTOCOL}.`);
      }
      this.roundtrips += 1;
      if (carried) carried.model.confirmSent(carried.sent);
      this.adopt(json);
      return json;
    } catch (e) {
      this.emit('error', e);
      throw e;
    } finally {
      this.setBusy(false);
      if (this.queued) {
        const q = this.queued;
        this.queued = null;
        this.fire(q.slot, q.event, q.args, q.flags).catch(() => {});
      }
    }
  }

  adopt(response) {
    const prev = this.state;
    const next = applyResponse(prev, response);
    this.lastResponse = response;
    // another APP than the one rendered last takes POPUP and POPOVER down -
    // unless this very response displays them (spec/response.md)
    if (prev.app && next.app && next.app !== prev.app) {
      const shown = new Set(((response.S_FRONT.S_ACTION || {}).T_SYSTEM || [])
        .filter((a) => Array.isArray(a) && a[0] === 'VIEW_SLOTS' && a[1] === 'display').map((a) => a[2]));
      for (const slot of ['POPUP', 'POPOVER']) {
        if (next.slots[slot] && !shown.has(slot)) {
          delete next.slots[slot];
          delete next.models[slot];
        }
      }
    }
    if (next.app && next.app !== prev.app) {
      const i = this.appStack.lastIndexOf(next.app);
      if (i >= 0) this.appStack = this.appStack.slice(0, i + 1);
      else this.appStack.push(next.app);
    }
    const changed = Object.keys({ ...prev.slots, ...next.slots }).filter((s) => prev.slots[s] !== next.slots[s]);
    for (const key of MODEL_KEYS) {
      const m = next.models[key];
      if (!m) {
        if (prev.models[key]) {
          this.models[key].edited.clear();
          this.models[key].replace({});
        }
        continue;
      }
      if (m !== prev.models[key]) this.models[key].replace(clone(m.data) || {});
    }
    this.state = next;
    const custom = next.custom || [];
    const router = (response.S_FRONT.S_ACTION && response.S_FRONT.S_ACTION.T_SYSTEM || [])
      .filter((a) => Array.isArray(a) && a[0] === 'ROUTER');
    // the ROUTER action's options (one per response, spec/navigation.md);
    // {} without one - the URL follows the new draft id either way
    const routerOptions = Object.assign({}, ...router.map((a) => (a[2] && typeof a[2] === 'object' ? a[2] : {})));
    this.emit('response', { state: next, changed, custom, router, routerOptions, appChanged: !!(next.app && next.app !== prev.app && prev.app), response });
  }

  end() {
    if (this.transport.endSession) this.transport.endSession();
  }
}
