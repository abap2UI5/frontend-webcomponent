/*
 * Frontend actions: the T_CUSTOM follow-up actions a response carries and
 * the eF(...) wires of a view - pure data, `[NAME, ...args]`, dispatched by
 * name (the UI5 frontend's core/FrontendAction.js and core/actions/*).
 *
 * Supported here (the portable set):
 *   MESSAGE_TOAST show <text> [opts]          toast (onClose -> eB)
 *   MESSAGE_BOX <type> <text> [opts]          dialog (actions, onClose -> eB(action))
 *   CONTROL_GLOBAL MESSAGE_TOAST|MESSAGE_BOX|VIEW_SLOTS destroy|BUSY_INDICATOR|THEMING|INVISIBLE_MESSAGE announce
 *   SET_TITLE <title>                         document title (standalone) / title event
 *   OPEN_NEW_TAB <url>, LOCATION_RELOAD <url>, URLHELPER REDIRECT {URL}
 *   CLIPBOARD_COPY <text>
 *   START_TIMER <event> <ms> [noBusy]         one-shot eB after a delay
 *   SET_FOCUS <id> [start] [end]
 *   HASH_BACK [fallback]                      one step back, or the fallback route (core/router.js)
 *   SET_PUSH_STATE, HASH_REPLACE, HASH_ATTACH_CHANGED, SET_NAV_ROUTING,
 *   SET_APP_STATE_ACTIVE                      the client-API names of the ROUTER options: a backend
 *                                             folds them into the ROUTER system action, but as a
 *                                             wired eF (or an older backend's follow-up) they are
 *                                             handed to the router as the same options
 * Everything else is reported (diagnostics + console), never thrown.
 *
 * URLs follow the UI5 frontend's rules: OPEN_NEW_TAB and LOCATION_RELOAD only
 * same-origin, REDIRECT only http(s).
 */

const toText = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function isSameOriginUrl(url, base = globalThis.location && globalThis.location.href) {
  try {
    const u = new URL(String(url), base);
    const b = new URL(base);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === b.origin;
  } catch {
    return false;
  }
}

export function isHttpUrl(url) {
  try {
    const u = new URL(String(url), globalThis.location && globalThis.location.href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {object} o
 * @param {object} o.ui        { toast, box, setTitle, focus, busy, theme, openUrl, navigate, back, route, announce }
 * @param {Function} o.fire    (slot, event, args, flags) => Promise - an eB roundtrip
 * @param {Function} o.closeSlot (slot) => void
 * @param {Function} o.report  ({ kind: 'action', detail }) => void
 */
export function createActions({ ui, fire, closeSlot, report }) {
  const timers = new Map();

  const unsupported = (name, why = 'not supported by this frontend') => {
    report({ kind: 'action', detail: `${name}: ${why}` });
  };

  const toast = (text, opts = {}, slot = 'MAIN') => {
    const o = opts && typeof opts === 'object' ? opts : {};
    ui.toast(toText(text), {
      duration: Number(o.duration) || 3000,
      onClose: o.onClose ? () => fire(slot, String(o.onClose), []) : null,
    });
  };

  const box = (type, text, opts = {}, slot = 'MAIN') => {
    const o = opts && typeof opts === 'object' ? opts : {};
    ui.box(String(type || 'show').toLowerCase(), toText(text), {
      title: o.title,
      details: o.details,
      actions: Array.isArray(o.actions) ? o.actions.map(String) : (o.actions ? [String(o.actions)] : null),
      emphasizedAction: o.emphasizedAction,
      onClose: o.onClose ? (action) => fire(slot, String(o.onClose), [action]) : null,
    });
  };

  const handlers = Object.assign(Object.create(null), {
    MESSAGE_TOAST: (a, slot) => toast(a[2], a[3], slot),
    MESSAGE_BOX: (a, slot) => box(a[1], a[2], a[3], slot),
    CONTROL_GLOBAL: (a, slot) => {
      const [, target, method, ...rest] = a;
      if (target === 'MESSAGE_TOAST' || target === 'MESSAGE_BOX') {
        // the text may be a template: its {0}, {1} ... are the plain
        // arguments behind it (a wired toast composed on the client); the
        // option object is the object argument
        const values = rest.slice(1).filter((x) => x === null || typeof x !== 'object');
        const opts = rest.slice(1).find((x) => x && typeof x === 'object');
        const text = toText(rest[0]).replace(/\{(\d+)\}/g, (m, i) => (values[i] !== undefined ? toText(values[i]) : m));
        return target === 'MESSAGE_TOAST' ? toast(text, opts, slot) : box(method, text, opts, slot);
      }
      if (target === 'VIEW_SLOTS' && method === 'destroy') return closeSlot(String(rest[0]));
      if (target === 'BUSY_INDICATOR') return ui.busy(method === 'show');
      if (target === 'INVISIBLE_MESSAGE' && method === 'announce' && ui.announce) return ui.announce(toText(rest[0]), toText(rest[1]));
      if (target === 'THEMING' && method === 'setTheme') return ui.theme(String(rest[0]));
      return unsupported(`CONTROL_GLOBAL ${target}.${method}`);
    },
    SET_TITLE: (a) => ui.setTitle(toText(a[1])),
    OPEN_NEW_TAB: (a) => (isSameOriginUrl(a[1]) ? ui.openUrl(String(a[1]), '_blank') : unsupported('OPEN_NEW_TAB', `refused URL ${a[1]} (same origin only)`)),
    LOCATION_RELOAD: (a) => (isSameOriginUrl(a[1]) ? ui.navigate(String(a[1])) : unsupported('LOCATION_RELOAD', `refused URL ${a[1]} (same origin only)`)),
    URLHELPER: (a) => {
      const params = a[2] || {};
      if (a[1] === 'REDIRECT' && isHttpUrl(params.URL)) return ui.openUrl(String(params.URL), params.NEW_WINDOW ? '_blank' : '_self');
      return unsupported(`URLHELPER ${a[1]}`);
    },
    CLIPBOARD_COPY: (a) => {
      try {
        globalThis.navigator.clipboard.writeText(toText(a[1])).catch(() => unsupported('CLIPBOARD_COPY', 'clipboard refused'));
      } catch {
        unsupported('CLIPBOARD_COPY', 'no clipboard');
      }
    },
    START_TIMER: (a, slot) => {
      const [name, event, delay, noBusy] = a;
      clearTimeout(timers.get(name));
      timers.set(name, setTimeout(() => {
        timers.delete(name);
        fire(slot, String(event), [], { noBusy: noBusy === true || noBusy === 'X' || noBusy === 'true' });
      }, Number(delay) || 0));
    },
    SET_FOCUS: (a) => ui.focus(String(a[1] || ''), a[2], a[3]),
    HASH_BACK: (a) => ui.back(a[1] === undefined || a[1] === null || a[1] === '' ? undefined : String(a[1])),
    // the ROUTER options under their client-API names (spec/actions.md)
    SET_PUSH_STATE: (a) => ui.route({ setPushState: toText(a[1]) }),
    HASH_REPLACE: (a) => ui.route({ setHashReplace: toText(a[1]) }),
    HASH_ATTACH_CHANGED: (a) => ui.route({ setHashEvent: toText(a[1]) || ' ' }),
    SET_NAV_ROUTING: (a) => ui.route({ setNavRouting: toText(a[1]) || 'DEFAULT' }),
    // no argument switches it on, a single blank off (the client API's encoding)
    SET_APP_STATE_ACTIVE: (a) => ui.route({ setAppStateActive: a[1] !== ' ' }),
  });

  return {
    /** Run one action (`[NAME, ...args]` or its JSON string) for a view in `slot`. */
    run(item, slot = 'MAIN') {
      let a = item;
      if (typeof a === 'string') {
        try {
          a = JSON.parse(a);
        } catch {
          a = null;
        }
      }
      if (!Array.isArray(a) || !a.length) {
        report({ kind: 'action', detail: `not an action payload: ${toText(item).slice(0, 80)}` });
        return;
      }
      const h = handlers[a[0]];
      if (!h) {
        unsupported(String(a[0]));
        return;
      }
      try {
        h(a, slot);
      } catch (e) {
        console.error(`[abap2ui5-wc] action ${a[0]} failed`, e);
        report({ kind: 'action', detail: `${a[0]} failed: ${e.message}` });
      }
    },
    /** Cancel pending timers (a new roundtrip overrides them, as in the UI5 frontend). */
    cancelTimers() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
    supported: () => Object.keys(handlers),
  };
}
