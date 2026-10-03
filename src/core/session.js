/*
 * The core protocol client: one abap2UI5 app session, as the UI5 frontend
 * keeps it per component (core/Server.js, controller/View1.controller.js,
 * core/actions/Slots.js), without any rendering.
 *
 *   start(app)        POST { S_FRONT: { ORIGIN, PATHNAME, SEARCH: '?app_start=<CLASS>' } }
 *   fire(slot, ...)   an eB wire: { S_FRONT: { ID, EVENT, T_EVENT_ARG }, MODEL: <delta> }
 *   closeSlot(slot)   the frontend-only popup/popover close (no roundtrip)
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
 * The renderer subscribes with onResponse(fn): fn({ state, changed, custom,
 * response }) after every adopted response - `changed` lists the slots whose
 * view must be (re)built, `custom` the T_CUSTOM follow-up actions to run
 * once the DOM exists.
 */
import { applyResponse, emptyState, modelKeyOf } from '../vendor/agent/snapshot.mjs';
import { buildDelta, errorText } from '../vendor/agent/appclient.mjs';
import { Model, createDeviceModel } from '../bindings/model.js';

export const PROTOCOL = 2;
const MODEL_KEYS = ['MAIN', 'POPUP', 'POPOVER'];
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

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
   * @param {boolean} [o.sendHash] send the page hash with every request (standalone page)
   */
  constructor({ transport, location, window: win, sendHash = false } = {}) {
    this.transport = transport;
    this.location = location;
    this.sendHash = sendHash;
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
    const where = await this.location(app);
    const front = { ORIGIN: where.origin, PATHNAME: where.pathname, SEARCH: where.search };
    if (where.hash) front.HASH = where.hash;
    this.state = emptyState();
    for (const m of Object.values(this.models)) {
      m.edited.clear();
      m.replace({});
    }
    return this.send({ S_FRONT: front }, null);
  }

  /**
   * Fire an eB wire from a view in `slot`.
   * @param {string} slot   MAIN | NEST | NEST2 | POPUP | POPOVER
   * @param {string} event  the event name
   * @param {Array} args    the computed T_EVENT_ARG
   * @param {object} [flags] { useMainModel, queueLast, noBusy }
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
    if (this.sendHash && globalThis.location && globalThis.location.hash) body.S_FRONT.HASH = globalThis.location.hash;
    let sent = null;
    if (model.edited.size) {
      sent = new Map(model.edited);
      body.MODEL = buildDelta([...sent.keys()], model.data);
    }
    return this.send(body, sent ? { model, sent } : null, flags);
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
      if (!res.ok) throw new ProtocolError(errorText(res.status, res.body), { status: res.status, retry: res.status >= 502 });
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
    this.emit('response', { state: next, changed, custom, router, response });
  }

  end() {
    if (this.transport.endSession) this.transport.endSession();
  }
}
