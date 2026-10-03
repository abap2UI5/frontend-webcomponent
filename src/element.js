/*
 * <abap2ui5-app> - an abap2UI5 app as a custom element, embeddable in any
 * page or framework (React, Vue, Angular, plain HTML).
 *
 *   <abap2ui5-app endpoint="/sap/bc/z2ui5" app="Z2UI5_CL_MY_APP"></abap2ui5-app>
 *
 * Attributes (all optional but `endpoint` and `app`):
 *   endpoint        the abap2UI5 HTTP service (absolute or relative URL)
 *   app             the app class to start (re-starts when changed)
 *   params          extra start parameters, `a=1&b=2` (sent in SEARCH)
 *   theme           a UI5 Web Components theme (sap_horizon, sap_horizon_dark, sap_fiori_3, ...)
 *   credentials     fetch credentials: same-origin (default) | include | omit
 *   csrf            auto (default: token handshake on 403 "Required") | fetch | none | <token>
 *   diagnostics     "off" hides the diagnostics panel (reports still go to the console and events)
 *   document-title  SET_TITLE also sets document.title (always on in the standalone page)
 *   standalone      the element owns the page: the URL hash is the app's (routes, app state,
 *                   Back/Forward) and travels with every request
 *   routing         the URL hash: hash (read and write the page's hash - the default with
 *                   standalone) | events (never touch the host's URL: every hash the app
 *                   would write is an abap2ui5-route event, and the host reports a hash
 *                   change of its own with navigate() - the default embedded) | off
 *
 * Properties: headers (extra request headers, e.g. Authorization),
 * transport (a custom { roundtrip(body), endSession() } - set before connect),
 * session, diagnostics (read-only); methods restart(), navigate(hash).
 *
 * Events (bubbling, composed): abap2ui5-response, abap2ui5-request,
 * abap2ui5-message, abap2ui5-title, abap2ui5-error, abap2ui5-diagnostic,
 * abap2ui5-route ({ action: push | replace | back, hash, app, id } - routing="events").
 */
import { FrontendApp } from './ui/app.js';

const ATTRS = ['endpoint', 'app', 'params', 'theme', 'credentials', 'csrf', 'diagnostics', 'document-title', 'standalone', 'routing'];

export class Abap2UI5App extends HTMLElement {
  static get observedAttributes() {
    return ATTRS;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.headers = {};
    this.transport = null;
    this._app = null;
  }

  connectedCallback() {
    if (!this._app) this._boot();
  }

  disconnectedCallback() {
    // a move inside the DOM disconnects and reconnects in the same task
    queueMicrotask(() => {
      if (!this.isConnected && this._app) {
        this._app.destroy();
        this._app = null;
        this.shadowRoot.replaceChildren();
      }
    });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this._app) return;
    if (name === 'theme') this._app.setTheme(newValue);
    else if (['endpoint', 'app', 'params', 'credentials', 'csrf', 'routing'].includes(name)) this.restart();
  }

  get session() {
    return this._app ? this._app.session : null;
  }

  get diagnostics() {
    return this._app ? this._app.diagnostics() : [];
  }

  /**
   * A hash change for the app (routing="events": the host's own Back button
   * or deep link, as the host recorded it from abap2ui5-route): a route to
   * another app state is restored, an app-owned hash raises its event - the
   * hash travels with that one request. With routing="hash" it sets the
   * page's hash.
   */
  navigate(hash) {
    if (this._app) this._app.navigate(hash);
  }

  restart() {
    if (this._app) this._app.destroy();
    this._app = null;
    this.shadowRoot.replaceChildren();
    if (this.isConnected) this._boot();
  }

  _boot() {
    const endpoint = this.getAttribute('endpoint');
    const app = this.getAttribute('app');
    if (!endpoint || !app) return;
    this._app = new FrontendApp({
      root: this.shadowRoot,
      host: this,
      endpoint,
      transport: this.transport || undefined,
      credentials: this.getAttribute('credentials') || 'same-origin',
      csrf: this.getAttribute('csrf') || 'auto',
      headers: this.headers,
      standalone: this.hasAttribute('standalone'),
      routing: this.getAttribute('routing') || undefined,
      documentTitle: this.hasAttribute('document-title'),
      search: this.getAttribute('params') || '',
      diagnostics: this.getAttribute('diagnostics') !== 'off',
    });
    const theme = this.getAttribute('theme');
    if (theme) this._app.setTheme(theme);
    this._app.start(app);
  }
}

export function defineElement(name = 'abap2ui5-app') {
  if (!customElements.get(name)) customElements.define(name, class extends Abap2UI5App {});
}
