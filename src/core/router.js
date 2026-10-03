/*
 * The URL hash: routes, the app-state hash and app-owned hashes - the
 * `ROUTER` system action and the `HASH_BACK` follow-up action
 * (spec/navigation.md "Routes", "The app-state hash", "The router action";
 * the UI5 frontend's core/Router.js is the reference this follows rule by
 * rule). DOM-free: the URL it reads and writes is an object of its own -
 *
 *   pageUrl(window)   the page's own hash (location.hash + the History API)
 *                     - the standalone page, or an element configured with
 *                     routing="hash"
 *   eventUrl(emit)    a virtual hash for an embedded element: every write is
 *                     an `abap2ui5-route` event for the host, the host's
 *                     URL is never touched, and the host reports a change
 *                     of its own back through set()
 *
 * The URL holds the RAW hash without '#': inside the SAP Fiori launchpad
 * the shell owns the part before '&/' (splitHash), and a write keeps it.
 *
 * Per response the frontend calls sync(options, { id, app }) once, after
 * the views are built and before the follow-up actions run - with the
 * options of the response's ROUTER action, or {} when it carries none (the
 * new draft id goes into a KEEP route either way). The router decides one
 * outcome from them: adopt the hash, push a route, replace it, write the
 * app's own hash, write or clear the app-state hash.
 *
 * Hash changes it did not write (browser Back/Forward, a manual edit; the
 * History API fires no event for its own writes) come in through the URL's
 * listen(): under routing a route that names another app state is restored
 * by an app-start-shaped request (navigate(hash)), with app-owned routing
 * the registered event is raised (raise(event, hash)). Both wait while a
 * roundtrip runs and go out when it ends (idle()).
 */

const APP_ROUTE_PREFIX = '/app/';
const SHELL_SEPARATOR = '&/';

/** A raw hash -> { shell, app }: the launchpad shell part and the app hash. */
export function splitHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  // an app hash starts with '/', a shell hash never does - and an app hash
  // may contain '&/' itself, so this test comes first
  if (!raw || raw.startsWith('/')) return { shell: '', app: raw };
  const i = raw.indexOf(SHELL_SEPARATOR);
  if (i < 0) return { shell: '', app: raw };
  let app = raw.slice(i + SHELL_SEPARATOR.length).replace(/^\/+/, '');
  if (app) app = `/${app}`;
  return { shell: raw.slice(0, i), app };
}

/** The app part of a hash in its one canonical form: a leading '/', '' for the empty route. */
export function appHashOf(hash) {
  const app = splitHash(hash).app;
  if (app === '/') return '';
  return app && !app.startsWith('/') ? `/${app}` : app;
}

/** The route of an app state: /app/<CLASS> or /app/<CLASS>/<DRAFT>. */
export function patternFor(app, draft) {
  const base = `${APP_ROUTE_PREFIX}${app}`;
  return draft ? `${base}/${draft}` : base;
}

/** A hash -> { app, draft } when it is an app route, else null. */
export function parseRoute(hash) {
  // leading slashes may stack (#//app/X)
  const app = splitHash(hash).app.replace(/^\/+/, '');
  if (!app.startsWith('app/')) return null;
  const parts = app.slice(4).split(/[&?]/)[0].split('/');
  // a namespaced class carries the separator in its name: app//NS/CL_X/<DRAFT>
  if (parts[0] === '') {
    if (parts.length < 3 || !parts[1] || !parts[2]) return null;
    return { app: `/${parts[1]}/${parts[2]}`, draft: parts.length > 3 ? parts[3] : '' };
  }
  if (!parts[0]) return null;
  return { app: parts[0], draft: parts.length > 1 ? parts[1] : '' };
}

/** The page's own URL hash. Writes go through the History API (no hashchange echo). */
export function pageUrl(win) {
  return {
    kind: 'page',
    get: () => String(win.location.hash || '').replace(/^#/, ''),
    write(raw, push) {
      const url = `${win.location.pathname}${win.location.search}${raw ? `#${raw}` : ''}`;
      if (push) win.history.pushState(win.history.state, '', url);
      else win.history.replaceState(win.history.state, '', url);
    },
    back: () => win.history.back(),
    listen(fn) {
      const h = () => fn(String(win.location.hash || '').replace(/^#/, ''));
      win.addEventListener('hashchange', h);
      return () => win.removeEventListener('hashchange', h);
    },
  };
}

/**
 * A virtual hash for an embedded element. `emit(detail)` tells the host:
 *   { action: 'push' | 'replace', hash: '#...' }   the hash this app now stands on
 *   { action: 'back' }                              the app asked for one step back
 * set(hash) is the host's way back in: a hash change of its own (its Back
 * button, a deep link) that the router treats like a browser hash change.
 */
export function eventUrl(emit) {
  let current = '';
  const listeners = new Set();
  return {
    kind: 'events',
    get: () => current,
    write(raw, push) {
      if (!push && raw === current) return;
      current = raw;
      emit({ action: push ? 'push' : 'replace', hash: raw ? `#${raw}` : '' });
    },
    back: () => emit({ action: 'back' }),
    set(hash) {
      const raw = String(hash || '').replace(/^#/, '');
      if (raw === current) return;
      current = raw;
      for (const fn of [...listeners]) fn(raw);
    },
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export class Router {
  /**
   * @param {object} o
   * @param {object} o.url            pageUrl(window) or eventUrl(emit)
   * @param {Function} o.navigate     (hash) => void - restore the app state a route names (app-start-shaped request)
   * @param {Function} o.raise        (event, hash) => void - the app-owned hash listener's event
   * @param {Function} [o.isBusy]     () => boolean - a roundtrip is running
   * @param {Function} [o.report]     ({ kind, detail }) => void
   */
  constructor({ url, navigate, raise, isBusy = () => false, report = () => {} }) {
    this.url = url;
    this.navigate = navigate;
    this.raise = raise;
    this.isBusy = isBusy;
    this.report = report;
    this.state = {
      navRouting: false,
      navMode: null,
      currentApp: '',
      currentDraftId: null,
      navFromHash: false,
      hashEvent: null,
      appHash: '',
      pending: null,
      pushCount: 0,
    };
    this.unlisten = null;
  }

  start() {
    if (!this.unlisten) this.unlisten = this.url.listen((raw) => this.onHashChanged(raw));
  }

  stop() {
    if (this.unlisten) this.unlisten();
    this.unlisten = null;
  }

  /** The hash a request carries as S_FRONT.HASH ('#...'), or undefined. */
  requestHash() {
    const raw = this.url.get();
    return raw ? `#${raw}` : undefined;
  }

  /* --------------------------------------------------------- writing --- */

  /** Write an app hash, keeping the launchpad shell part of the raw hash. */
  write(appHash, push) {
    const { shell } = splitHash(this.url.get());
    const app = String(appHash || '');
    const raw = shell ? (app ? `${shell}&/${app.replace(/^\/+/, '')}` : shell) : app;
    if (push) this.state.pushCount += 1;
    this.url.write(raw, push);
  }

  /** The app's own suffix appended to the raw hash (hash_set without a listener). */
  writeSuffix(suffix, push) {
    if (push) this.state.pushCount += 1;
    this.url.write(`${this.url.get()}${suffix}`, push);
  }

  /* ------------------------------------------------------ the response --- */

  /** A response naming another app than the last one: the app-owned listener dies with it. */
  appChanged() {
    this.state.hashEvent = null;
    this.state.appHash = '';
    if (this.state.pending && this.state.pending.kind === 'event') this.state.pending = null;
  }

  /**
   * Once per response, after rendering: `options` = the ROUTER action's
   * options ({} without one), `id` the response's draft id, `app` its APP.
   */
  sync(options = {}, { id, app } = {}) {
    const o = options && typeof options === 'object' ? options : {};
    const state = this.state;
    try {
      if (o.setNavRouting) {
        const mode = String(o.setNavRouting).toUpperCase();
        const on = mode === 'KEEP' || mode === 'FRESH';
        state.navRouting = on;
        state.navMode = on ? mode : null;
      }
      if (o.setHashEvent) {
        state.hashEvent = String(o.setHashEvent).trim() || null;
        // the hash the URL stands on is the app's known value: the first
        // CHANGE dispatches, not the registration's own render
        state.appHash = appHashOf(this.url.get());
      }
      const appWrite = o.setPushState || o.setHashReplace;
      const push = Boolean(o.setPushState);

      if (state.navRouting) {
        if (app) this.updateAppRoute(o, id, app);
        if (!appWrite) return;
        // KEEP: the app's suffix rides behind the current route, as a route
        if (state.currentDraftId) {
          this.write(patternFor(state.currentApp, state.currentDraftId) + appWrite, push);
          return;
        }
      }
      if (appWrite) {
        if (state.hashEvent) {
          state.appHash = appHashOf(appWrite);
          this.write(appWrite, push);
          return;
        }
        this.writeSuffix(appWrite, push);
        return;
      }
      // an app-owned hash listener owns the whole hash: no upkeep
      if (state.hashEvent) return;
      const next = o.setAppStateActive ? `/z2ui5-xapp-state=${id || ''}` : '';
      if (appHashOf(this.url.get()) !== next) this.write(next, false);
    } catch (e) {
      this.report({ kind: 'router', detail: `hash update failed: ${e.message}` });
    }
  }

  updateAppRoute(o, id, app) {
    const state = this.state;
    // FRESH routes carry the class only, KEEP routes the draft too
    const draft = state.navMode === 'FRESH' ? null : id;
    state.currentApp = app;
    state.currentDraftId = draft;
    if (state.navFromHash) {
      // the answer to a Back/Forward: the URL already stands on this entry,
      // and rewriting it would drop the forward entries
      state.navFromHash = false;
      return;
    }
    if (o.setPushState || o.setHashReplace) return;
    const route = patternFor(app, draft);
    if (o.checkNavAppCall) {
      // a nav_app_call: point the caller's entry at the draft saved at the
      // call (Back then restores the caller WITH the edits the event
      // carried), then push the called app's route
      if (draft && o.navAppCallPrevApp && o.navAppCallPrevId) {
        const prev = patternFor(o.navAppCallPrevApp, o.navAppCallPrevId);
        if (appHashOf(this.url.get()) !== prev) this.write(prev, false);
      }
      this.write(route, true);
    } else if (appHashOf(this.url.get()) !== route) {
      this.write(route, false);
    }
  }

  /* ------------------------------------------------------- HASH_BACK --- */

  /** The UI5 onNavBack pattern: one real step back, or the fallback route on a cold deep link. */
  back(fallback) {
    if (!fallback || this.state.pushCount > 0) {
      this.url.back();
      return;
    }
    this.write(String(fallback), false);
    // a History API write fires no hashchange: the change is dispatched
    // here, so the app's listener (or the router) shows the fallback route
    this.onHashChanged(this.url.get());
  }

  /* --------------------------------------------- hash changes from out --- */

  onHashChanged(raw) {
    const state = this.state;
    if (!state.navRouting) {
      if (!state.hashEvent) return;
      const appHash = appHashOf(raw);
      if (appHash === state.appHash) return;
      if (this.isBusy()) {
        state.pending = { kind: 'event', raw };
        return;
      }
      state.pending = null;
      state.appHash = appHash;
      this.raise(state.hashEvent, raw ? `#${raw}` : '');
      return;
    }
    const route = parseRoute(raw);
    if (!route) return;
    // the route of the state on screen: nothing to restore
    if (route.draft) {
      if (route.draft === state.currentDraftId) return;
    } else if (route.app.toUpperCase() === String(state.currentApp).toUpperCase()) {
      return;
    }
    if (this.isBusy()) {
      state.pending = { kind: 'route', raw };
      return;
    }
    state.pending = null;
    state.navFromHash = true;
    this.navigate(raw ? `#${raw}` : '');
  }

  /** A roundtrip ended: deliver the hash change that came in meanwhile. */
  idle() {
    const p = this.state.pending;
    if (!p) return;
    this.state.pending = null;
    this.onHashChanged(p.raw);
  }

  /** The restore a route asked for failed: the next response is no Back/Forward answer. */
  restoreFailed() {
    this.state.navFromHash = false;
  }
}
