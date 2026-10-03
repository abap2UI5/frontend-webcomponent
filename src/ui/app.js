/*
 * The frontend: a Session (core protocol) + the Renderer (view profile) +
 * the view slots, messages, busy state, errors and diagnostics, mounted
 * into one root (the custom element's shadow root).
 *
 *   MAIN          the page, rebuilt on every MAIN display
 *   NEST / NEST2  a nested view, inserted into the MAIN control the
 *                 display's options name (`id`); v1.1 of the profile
 *   POPUP         the fragment's ui5-dialog, opened on display, closed on destroy
 *   POPOVER       the fragment's ui5-popover, opened at the `openById` control
 */
import { Session } from '../core/session.js';
import { createActions } from '../core/actions.js';
import { createFetchTransport } from '../core/transport.js';
import { Renderer } from '../render/renderer.js';
import registry from '../render/registry.js';
import '../render/controls/index.js';
import { CSS } from './styles.js';

const BOX_TITLE = { confirm: 'Confirmation', error: 'Error', warning: 'Warning', success: 'Success', information: 'Information', alert: 'Alert', show: '' };
const BOX_STATE = { error: 'Negative', warning: 'Critical', success: 'Positive', information: 'Information', confirm: 'None', alert: 'None', show: 'None' };
const ACTION_TEXT = { OK: 'OK', CANCEL: 'Cancel', YES: 'Yes', NO: 'No', ABORT: 'Abort', RETRY: 'Retry', IGNORE: 'Ignore', CLOSE: 'Close', DELETE: 'Delete' };

export class FrontendApp {
  /**
   * @param {object} o
   * @param {ShadowRoot|HTMLElement} o.root  where to render
   * @param {HTMLElement} o.host             dispatches the abap2ui5-* events
   * @param {string} o.endpoint
   * @param {object} [o.transport]           a transport ({ roundtrip, endSession }) - replaces endpoint/credentials/csrf/headers
   * @param {string} [o.credentials]
   * @param {string} [o.csrf]
   * @param {object} [o.headers]
   * @param {boolean} [o.standalone]         the page is ours: hash, document title
   * @param {string} [o.search]              extra start parameters (`&a=b`)
   * @param {boolean} [o.diagnostics]        show the diagnostics panel
   */
  constructor(o) {
    this.o = o;
    this.doc = o.root.ownerDocument || o.root;
    this.win = this.doc.defaultView || globalThis.window;
    this.host = o.host;
    this.diag = new Map();
    this.slots = {};
    this.mount();
    const transport = o.transport || createFetchTransport({
      endpoint: new URL(o.endpoint, this.win.location.href).href,
      credentials: o.credentials,
      csrf: o.csrf,
      headers: o.headers,
    });
    this.endpointPath = new URL(o.endpoint, this.win.location.href).pathname;
    this.session = new Session({
      transport,
      window: this.win,
      sendHash: !!o.standalone,
      location: (app) => ({
        origin: this.win.location.origin,
        pathname: o.standalone ? this.win.location.pathname : this.endpointPath,
        search: `?app_start=${encodeURIComponent(app)}${o.search ? `&${String(o.search).replace(/^[?&]/, '')}` : ''}`,
        hash: o.standalone && this.win.location.hash ? this.win.location.hash : undefined,
      }),
    });
    this.renderer = new Renderer({
      document: this.doc,
      registry,
      report: (d) => this.report(d),
      onEvent: (e) => this.onWire(e),
    });
    this.actions = createActions({
      ui: this.ui(),
      fire: (slot, event, args, flags) => this.fire(slot, event, args, flags),
      closeSlot: (slot) => this.session.closeSlot(slot),
      report: (d) => this.report(d),
    });
    this.session.on('response', (r) => this.onResponse(r));
    this.session.on('busy', ({ busy, silent }) => this.setBusy(busy, silent));
    this.session.on('error', (e) => this.showError(e));
    this.session.on('request', (body) => this.emit('abap2ui5-request', { body }));
  }

  mount() {
    const d = this.doc;
    const style = d.createElement('style');
    style.textContent = CSS;
    this.rootEl = d.createElement('div');
    this.rootEl.className = 'a2u-root';
    this.mainEl = d.createElement('div');
    this.mainEl.className = 'a2u-main';
    this.overlayEl = d.createElement('div');
    this.overlayEl.className = 'a2u-overlays';
    this.busyEl = d.createElement('div');
    this.busyEl.className = 'a2u-busy';
    const bi = d.createElement('ui5-busy-indicator');
    bi.setAttribute('active', '');
    bi.setAttribute('size', 'L');
    this.busyEl.appendChild(bi);
    this.diagEl = d.createElement('details');
    this.diagEl.className = 'a2u-diagnostics';
    this.diagEl.hidden = true;
    this.diagEl.innerHTML = '<summary></summary><ul></ul>';
    this.rootEl.append(this.mainEl, this.overlayEl, this.busyEl, this.diagEl);
    this.o.root.append(style, this.rootEl);
  }

  emit(type, detail) {
    if (this.host) this.host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /* ---------------------------------------------------------- lifecycle */

  async start(app) {
    this.app = app;
    this.clearSlots();
    try {
      await this.session.start(app);
    } catch {
      /* shown by showError */
    }
  }

  destroy() {
    this.actions.cancelTimers();
    this.clearSlots();
    this.session.end();
  }

  clearSlots() {
    for (const s of Object.keys(this.slots)) this.removeSlot(s);
  }

  /* --------------------------------------------------------- roundtrips */

  onWire({ slot, wire, args, el }) {
    if (wire.fn === 'eF') {
      this.actions.run([wire.action, ...args], slot);
      return;
    }
    if (el && el.closest && el.closest('.a2u-popover') && slot === 'MAIN') slot = 'POPOVER';
    this.fire(slot, wire.event, args, wire.options || {});
  }

  fire(slot, event, args = [], flags = {}) {
    this.actions.cancelTimers();
    return this.session.fire(slot, event, args, flags).catch(() => {});
  }

  onResponse({ state, changed, custom, local }) {
    for (const slot of ['MAIN', 'NEST', 'NEST2', 'POPUP', 'POPOVER']) {
      if (!changed.includes(slot)) continue;
      if (state.slots[slot]) this.renderSlot(slot, state.slots[slot]);
      else this.removeSlot(slot);
    }
    if (!local) {
      for (const item of custom) this.actions.run(item, 'MAIN');
      this.emit('abap2ui5-response', { app: state.app, id: state.id, slots: Object.keys(state.slots) });
    }
  }

  renderSlot(slot, { xml, options }) {
    this.removeSlot(slot);
    const rendered = this.renderer.renderXml(xml, { slot, models: this.session.modelsFor(slot) });
    const entry = { ...rendered, slot };
    this.slots[slot] = entry;
    if (slot === 'MAIN') {
      this.mainEl.replaceChildren(...rendered.nodes);
      this.mainEl.setAttribute('data-app', this.session.state.app || '');
    } else if (slot === 'NEST' || slot === 'NEST2') {
      const parent = this.findById(options && options.id, ['MAIN']);
      const holder = this.doc.createElement('div');
      holder.className = 'a2u-nested';
      holder.setAttribute('data-slot', slot);
      holder.append(...rendered.nodes);
      entry.holder = holder;
      if (!parent) {
        this.report({ kind: 'slot', detail: `${slot}: parent control '${options && options.id}' not found` });
        return;
      }
      if (options && options.methodDestroy) {
        for (const old of (parent.querySelector('.a2u-page-content') || parent).querySelectorAll(':scope > .a2u-nested')) old.remove();
      }
      (parent.querySelector(':scope > .a2u-page-content') || parent).appendChild(holder);
    } else {
      this.openPopup(slot, entry, options || {});
    }
  }

  findById(id, slots = ['MAIN', 'NEST', 'NEST2', 'POPUP', 'POPOVER']) {
    if (!id) return null;
    for (const s of slots) {
      const e = this.slots[s];
      if (e && e.ids.has(id)) return e.ids.get(id);
    }
    return null;
  }

  openPopup(slot, entry, options) {
    const want = slot === 'POPUP' ? 'UI5-DIALOG' : 'UI5-POPOVER';
    const holder = this.doc.createElement('div');
    holder.setAttribute('data-slot', slot);
    holder.append(...entry.nodes);
    this.overlayEl.appendChild(holder);
    entry.holder = holder;
    let popup = [...holder.querySelectorAll('ui5-dialog, ui5-popover')].find((p) => p.tagName === want)
      || holder.querySelector('ui5-dialog, ui5-popover');
    if (!popup) {
      // a fragment without its own dialog: wrap its content in one
      popup = this.doc.createElement(slot === 'POPUP' ? 'ui5-dialog' : 'ui5-popover');
      popup.append(...holder.childNodes);
      holder.appendChild(popup);
    }
    entry.popup = popup;
    popup.setAttribute('data-slot', slot);
    if (slot === 'POPOVER') {
      const opener = this.findById(options.openById, ['MAIN', 'NEST', 'NEST2', 'POPUP']);
      if (opener) popup.opener = opener;
      else this.report({ kind: 'slot', detail: `POPOVER: opener '${options.openById}' not found` });
    }
    popup.addEventListener('close', () => {
      // closed by the user (Escape / outside click on a popover): the slot
      // goes locally, as the UI5 frontend's popover autoclose does
      if (!popup.__a2uClosing && slot === 'POPOVER' && this.slots.POPOVER === entry) this.session.closeSlot('POPOVER');
    });
    requestAnimationFrame(() => { popup.open = true; });
  }

  removeSlot(slot) {
    const e = this.slots[slot];
    if (!e) return;
    delete this.slots[slot];
    e.scope.dispose();
    if (e.popup) {
      e.popup.__a2uClosing = true;
      e.popup.open = false;
    }
    if (slot === 'MAIN') this.mainEl.replaceChildren();
    else if (e.holder) e.holder.remove();
    if (slot === 'MAIN') {
      this.removeSlot('NEST');
      this.removeSlot('NEST2');
    }
  }

  /* ------------------------------------------------------- client UI ---- */

  ui() {
    return {
      toast: (text, { duration, onClose }) => {
        const t = this.doc.createElement('ui5-toast');
        t.textContent = text;
        t.duration = duration;
        t.setAttribute('placement', 'BottomCenter');
        t.addEventListener('close', () => {
          t.remove();
          if (onClose) onClose();
        });
        this.overlayEl.appendChild(t);
        requestAnimationFrame(() => { t.open = true; });
        this.emit('abap2ui5-message', { type: 'toast', text });
      },
      box: (type, text, opts) => this.messageBox(type, text, opts),
      setTitle: (title) => {
        if (this.o.standalone || this.o.documentTitle) this.doc.title = title;
        this.emit('abap2ui5-title', { title });
      },
      focus: (id, start, end) => {
        const el = this.findById(id);
        if (!el) return this.report({ kind: 'action', detail: `SET_FOCUS: no control '${id}'` });
        requestAnimationFrame(() => {
          el.focus();
          const inner = el.shadowRoot && el.shadowRoot.querySelector('input,textarea');
          if (inner && start !== undefined && start !== null && start !== '') inner.setSelectionRange(Number(start), Number(end ?? start));
        });
        return undefined;
      },
      busy: (show) => this.setBusy(show, false),
      theme: (name) => this.setTheme(name),
      openUrl: (url, target) => this.win.open(url, target, target === '_blank' ? 'noopener' : undefined),
      navigate: (url) => { this.win.location.href = url; },
      back: () => this.win.history.back(),
    };
  }

  messageBox(type, text, { title, details, actions, emphasizedAction, onClose } = {}) {
    const d = this.doc;
    const dlg = d.createElement('ui5-dialog');
    dlg.className = 'a2u-messagebox';
    dlg.setAttribute('data-box-type', type);
    dlg.setAttribute('header-text', title || BOX_TITLE[type] || '');
    dlg.setAttribute('state', BOX_STATE[type] || 'None');
    const body = d.createElement('ui5-text');
    body.className = 'a2u-box-text';
    body.textContent = text;
    dlg.appendChild(body);
    if (details) {
      const det = d.createElement('div');
      det.className = 'a2u-box-details';
      det.textContent = typeof details === 'string' ? details.replace(/<[^>]+>/g, '') : JSON.stringify(details, null, 2);
      dlg.appendChild(det);
    }
    const list = actions && actions.length ? actions : (type === 'confirm' ? ['OK', 'CANCEL'] : ['OK']);
    const bar = d.createElement('ui5-bar');
    bar.setAttribute('slot', 'footer');
    bar.setAttribute('design', 'Footer');
    let done = false;
    const finish = (action) => {
      if (done) return;
      done = true;
      dlg.open = false;
      dlg.remove();
      if (onClose) onClose(action);
    };
    list.forEach((a, i) => {
      const b = d.createElement('ui5-button');
      b.setAttribute('slot', 'endContent');
      b.textContent = ACTION_TEXT[a] || a;
      b.setAttribute('data-action', a);
      if (a === emphasizedAction || (!emphasizedAction && i === 0)) b.setAttribute('design', 'Emphasized');
      b.addEventListener('click', () => finish(a));
      bar.appendChild(b);
    });
    dlg.appendChild(bar);
    dlg.addEventListener('close', () => finish(null));
    this.overlayEl.appendChild(dlg);
    requestAnimationFrame(() => { dlg.open = true; });
    this.emit('abap2ui5-message', { type: 'box', boxType: type, text });
  }

  async setTheme(name) {
    try {
      const { setTheme } = await import('@ui5/webcomponents-base/dist/config/Theme.js');
      await setTheme(name);
    } catch (e) {
      this.report({ kind: 'action', detail: `THEMING: ${e.message}` });
    }
  }

  setBusy(busy, silent) {
    clearTimeout(this.busyTimer);
    this.rootEl.setAttribute('data-roundtrip', busy ? 'running' : 'idle');
    if (!busy) {
      this.rootEl.removeAttribute('data-busy');
      return;
    }
    if (silent) return;
    this.busyTimer = setTimeout(() => this.rootEl.setAttribute('data-busy', 'shown'), 400);
  }

  showError(e) {
    console.error('[abap2ui5-wc]', e.message);
    this.emit('abap2ui5-error', { message: e.message, status: e.status });
    const d = this.doc;
    const dlg = d.createElement('ui5-dialog');
    dlg.className = 'a2u-error';
    dlg.setAttribute('header-text', 'App Terminated');
    dlg.setAttribute('state', 'Negative');
    const pre = d.createElement('pre');
    pre.className = 'a2u-error-text';
    pre.textContent = e.message;
    dlg.appendChild(pre);
    const bar = d.createElement('ui5-bar');
    bar.setAttribute('slot', 'footer');
    bar.setAttribute('design', 'Footer');
    const restart = d.createElement('ui5-button');
    restart.setAttribute('slot', 'endContent');
    restart.setAttribute('design', 'Emphasized');
    restart.textContent = 'Restart';
    restart.addEventListener('click', () => {
      dlg.remove();
      this.start(this.app);
    });
    const close = d.createElement('ui5-button');
    close.setAttribute('slot', 'endContent');
    close.textContent = 'Close';
    close.addEventListener('click', () => dlg.remove());
    bar.append(restart, close);
    dlg.appendChild(bar);
    this.overlayEl.appendChild(dlg);
    requestAnimationFrame(() => { dlg.open = true; });
  }

  /* -------------------------------------------------------- diagnostics */

  report({ kind, detail, control }) {
    const key = `${kind}: ${detail}`;
    const hit = this.diag.get(key);
    if (hit) {
      hit.count += 1;
      return;
    }
    const entry = { kind, detail, control, count: 1, app: this.session ? this.session.state.app : '' };
    this.diag.set(key, entry);
    console.warn(`[abap2ui5-wc] ${key}`);
    this.emit('abap2ui5-diagnostic', entry);
    if (this.o.diagnostics === false) return;
    const SEVERE = ['control', 'action', 'formatter', 'event', 'event-arg', 'binding', 'expression', 'type', 'slot'];
    if (!SEVERE.includes(kind)) return;
    const li = this.doc.createElement('li');
    li.textContent = key;
    this.diagEl.querySelector('ul').appendChild(li);
    const n = this.diagEl.querySelectorAll('li').length;
    this.diagEl.querySelector('summary').textContent = `${n} unsupported item${n === 1 ? '' : 's'} - this frontend renders the portable profile`;
    this.diagEl.hidden = false;
  }

  diagnostics() {
    return [...this.diag.values()];
  }
}
