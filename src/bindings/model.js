/*
 * The client-side models a rendered view binds against.
 *
 * One JSONModel-like Model per model-owning view slot (MAIN - shared with
 * NEST/NEST2 -, POPUP, POPOVER), the same split the UI5 frontend keeps
 * (vendored snapshot.mjs modelKeyOf). A Model outlives the responses: the
 * backend's model push replaces its data and every binding re-reads it, the
 * way JSONModel.setData() refreshes the bindings in place.
 *
 * Edits made through two-way bindings are recorded per path in `edited`
 * (the frontend's _z2ui5ChangedPaths); the next event fired from a view of
 * this model ships them as the delta (vendored appclient.mjs buildDelta).
 *
 * Named models (`{device>/system/phone}`) come from `namedModels`: the
 * frontend provides `device` (a one-way model over the browser, like
 * sap.ui.Device); anything else resolves to undefined and is reported.
 */
import { getAt, setAt } from '../vendor/agent/snapshot.mjs';

export class Model {
  constructor(key, data = {}) {
    this.key = key;
    this.data = data || {};
    this.edited = new Map();
    this.listeners = new Set();
    this.readOnly = false;
  }

  get(path) {
    if (path === '' || path === '/') return this.data;
    return getAt(this.data, path);
  }

  /** A two-way write: the value lands in the data and in `edited`. */
  set(path, value, { notify = true } = {}) {
    if (this.readOnly) return;
    setAt(this.data, path, value);
    this.edited.set(normalize(path), value);
    if (notify) this.notify();
  }

  /** The model push: new data, the edits not yet sent written over it. */
  replace(data) {
    this.data = data && typeof data === 'object' ? data : {};
    for (const [p, v] of this.edited) setAt(this.data, p, v);
    this.notify();
  }

  /** Forget the edits a successful roundtrip carried (those still holding the sent value). */
  confirmSent(sent) {
    for (const [p, v] of sent) {
      if (this.edited.has(p) && sameValue(this.edited.get(p), v)) this.edited.delete(p);
    }
  }

  notify() {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (e) {
        console.error('[abap2ui5-wc] binding refresh failed', e);
      }
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

const normalize = (p) => `/${String(p).split('/').filter((s) => s !== '').join('/')}`;
const sameValue = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/*
 * `device>` - what sap.ui.Device offers the bindings views actually write:
 * system.{phone,tablet,desktop}, orientation.{landscape,portrait},
 * resize.{width,height}, support.touch, browser.{name,version}, os.{name,version}.
 */
export function createDeviceModel(win = globalThis.window) {
  const m = new Model('device', {});
  m.readOnly = true;
  const compute = () => {
    const w = win ? win.innerWidth : 1280;
    const h = win ? win.innerHeight : 800;
    const ua = (win && win.navigator && win.navigator.userAgent) || '';
    const touch = !!(win && ('ontouchstart' in win || (win.navigator && win.navigator.maxTouchPoints > 0)));
    const browser = /Firefox\/(\d+)/.exec(ua) ? ['firefox', /Firefox\/(\d+)/.exec(ua)[1]]
      : /Edg\/(\d+)/.exec(ua) ? ['edge', /Edg\/(\d+)/.exec(ua)[1]]
        : /Chrome\/(\d+)/.exec(ua) ? ['chrome', /Chrome\/(\d+)/.exec(ua)[1]]
          : /Version\/(\d+).*Safari/.exec(ua) ? ['safari', /Version\/(\d+)/.exec(ua)[1]] : ['unknown', ''];
    const os = /Windows NT ([\d.]+)/.exec(ua) ? ['win', /Windows NT ([\d.]+)/.exec(ua)[1]]
      : /Mac OS X ([\d_]+)/.exec(ua) ? ['mac', /Mac OS X ([\d_]+)/.exec(ua)[1].replace(/_/g, '.')]
        : /Android ([\d.]+)/.exec(ua) ? ['Android', /Android ([\d.]+)/.exec(ua)[1]]
          : /Linux/.test(ua) ? ['linux', ''] : ['unknown', ''];
    m.data = {
      system: { phone: w < 600, tablet: w >= 600 && w < 1024 && touch, desktop: w >= 1024 || !touch, combi: touch && w >= 1024 },
      orientation: { landscape: w >= h, portrait: w < h },
      resize: { width: w, height: h },
      support: { touch, pointer: true, matchmedia: true, websocket: true },
      browser: { name: browser[0], version: browser[1] },
      os: { name: os[0], version: os[1] },
    };
  };
  compute();
  if (win && win.addEventListener) {
    win.addEventListener('resize', () => {
      compute();
      m.notify();
    });
  }
  return m;
}
