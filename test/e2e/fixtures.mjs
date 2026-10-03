/* global sap */
/*
 * Drivers for the two frontends and the protocol recorder.
 *
 * wc     the web-components frontend at /?app_start=<CLASS>, driven through
 *        its DOM (Playwright's CSS selectors pierce the shadow roots)
 * ui5    the official UI5 SPA the same node runtime serves at
 *        /sap/bc/z2ui5/?app_start=<CLASS>, driven through the UI5 control
 *        API (setValue + fireChange, firePress, ...) - what a user's input
 *        does to the controls - for the cross-check
 *
 * Both record every roundtrip ({ request, response } bodies) so a test can
 * assert the backend state and compare what the two frontends sent.
 *
 * UI5 itself comes from sdk.openui5.org; with OPENUI5_DIR (a node_modules/
 * @openui5 folder) set, its resources are served from there instead - the
 * sandbox has no CDN access.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';

const ENDPOINT = '/sap/bc/z2ui5';

function openui5Roots() {
  const dir = process.env.OPENUI5_DIR;
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((p) => path.join(dir, p, 'src')).filter((p) => fs.existsSync(p));
}
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.properties': 'text/plain' };

export class Recorder {
  constructor(page) {
    this.exchanges = [];
    page.on('requestfinished', async (req) => {
      if (req.method() !== 'POST' || !new URL(req.url()).pathname.startsWith(ENDPOINT)) return;
      const entry = { request: JSON.parse(req.postData() || '{}').value };
      this.exchanges.push(entry);
      try {
        const res = await req.response();
        entry.response = await res.json();
      } catch {
        entry.response = null;
      }
    });
  }

  get last() {
    return this.exchanges[this.exchanges.length - 1];
  }

  /** The events after the start, normalized for a comparison between frontends. */
  events() {
    return this.exchanges.filter((x) => x.request && x.request.S_FRONT && x.request.S_FRONT.EVENT).map((x) => normalize(x.request));
  }
}

export function normalize(body) {
  const f = body.S_FRONT || {};
  const out = { EVENT: f.EVENT };
  if (f.T_EVENT_ARG && f.T_EVENT_ARG.length) out.T_EVENT_ARG = f.T_EVENT_ARG;
  if (body.MODEL && Object.keys(body.MODEL).length) out.MODEL = body.MODEL;
  return out;
}

/** Wait for the next roundtrip `action` triggers; resolves with its { request, response }. */
export async function roundtrip(page, action) {
  const done = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith(ENDPOINT));
  await action();
  const res = await done;
  const json = await res.json();
  await page.waitForTimeout(150);
  return { request: JSON.parse(res.request().postData()).value, response: json };
}

export const customActions = (response) => (response && response.S_FRONT.S_ACTION && response.S_FRONT.S_ACTION.T_CUSTOM) || [];
export const toastText = (response) => {
  const t = customActions(response).find((a) => a[0] === 'MESSAGE_TOAST' || (a[0] === 'CONTROL_GLOBAL' && a[1] === 'MESSAGE_TOAST'));
  if (!t) return null;
  return t[0] === 'MESSAGE_TOAST' ? t[2] : t[3];
};
export const boxText = (response) => {
  const t = customActions(response).find((a) => a[0] === 'MESSAGE_BOX');
  return t ? t[2] : null;
};

/* --------------------------------------------------------- the wc side */

export class Wc {
  constructor(page) {
    this.page = page;
    this.rec = new Recorder(page);
    this.issues = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().startsWith('[abap2ui5-wc]')) this.issues.push(m.text());
    });
    page.on('pageerror', (e) => this.issues.push(`pageerror: ${e.message}`));
  }

  /** What the frontend reported as unsupported, without the ignored properties. */
  severe() {
    return this.issues.filter((i) => !/\] property: /.test(i));
  }

  async open(app) {
    await this.page.route('**://cdn.jsdelivr.net/**', (r) => r.abort());
    await this.page.goto(`/?app_start=${app}`);
    await expect(this.page.locator('abap2ui5-app .a2u-main [data-ui5-control]').first()).toBeAttached();
    await expect(this.root()).toHaveAttribute('data-roundtrip', 'idle');
  }

  root() {
    return this.page.locator('abap2ui5-app .a2u-root');
  }

  main() {
    return this.page.locator('abap2ui5-app .a2u-main');
  }

  control(name, scope = this.page.locator('abap2ui5-app')) {
    return scope.locator(`[data-ui5-control="${name}"]`);
  }

  button(text, scope) {
    return (scope || this.page.locator('abap2ui5-app')).locator('ui5-button, ui5-toolbar-button').filter({ hasText: text }).or(
      (scope || this.page.locator('abap2ui5-app')).locator(`ui5-toolbar-button[text="${text}"]`),
    ).first();
  }

  async press(text, scope) {
    return roundtrip(this.page, () => this.button(text, scope).click());
  }

  /** Type into the n-th ui5-input (in `scope`) and commit it (Tab -> change). */
  async fill(locator, value) {
    const inner = locator.locator('input, textarea').first();
    await inner.fill(String(value));
    await inner.press('Tab');
  }

  async idle() {
    await expect(this.root()).toHaveAttribute('data-roundtrip', 'idle');
  }
}

/* -------------------------------------------------------- the UI5 side */

export class Ui5 {
  constructor(page) {
    this.page = page;
    this.rec = new Recorder(page);
  }

  async open(app) {
    const roots = openui5Roots();
    if (roots.length) {
      await this.page.route('**://sdk.openui5.org/**', (route) => {
        const u = new URL(route.request().url());
        const rel = u.pathname.replace(/^\/resources\//, '').replace(/^sap-ui-cachebuster\//, '');
        for (const r of roots) {
          const f = path.join(r, rel);
          if (f.startsWith(r + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) {
            return route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || 'application/octet-stream' });
          }
        }
        return route.fulfill({ status: 404, body: '' });
      });
    }
    await this.page.route('**://cdn.jsdelivr.net/**', (r) => r.abort());
    await this.page.goto(`${ENDPOINT}/?app_start=${app}`);
    await this.page.waitForFunction(() => window.sap && sap.ui && sap.ui.getCore && document.querySelectorAll('[data-sap-ui]').length > 3, null, { timeout: 90_000 });
    await this.page.waitForTimeout(500);
  }

  /** Run `fn(controls, arg)` in the page: controls = every live UI5 control, in creation order.
   *  Retried for a few seconds while it throws (the view may still be rendering). */
  async withControls(fn, arg) {
    let last;
    for (let i = 0; i < 20; i += 1) {
      try {
        return await this.evalControls(fn, arg);
      } catch (e) {
        last = e;
        await this.page.waitForTimeout(500);
      }
    }
    throw last;
  }

  async evalControls(fn, arg) {
    return this.page.evaluate(([src, a]) => {
      const Element = sap.ui.require('sap/ui/core/Element');
      const all = Element && Element.registry ? Element.registry.filter(() => true) : Object.values(sap.ui.getCore().mElements || {});
      return new Function('controls', 'arg', `return (${src})(controls, arg)`)(all, a);
    }, [fn.toString(), arg]);
  }

  /** Press the visible Button (or other pressable) with this text. */
  async press(text) {
    return roundtrip(this.page, () => this.withControls((cs, t) => {
      const all = cs.filter((c) => /^sap\.m\.(Button|OverflowToolbarButton)$/.test(c.getMetadata().getName()) && c.getText && c.getText() === t);
      const b = all.find((c) => c.getDomRef()) || all[0];
      if (!b) throw new Error(`no button ${t}`);
      b.firePress();
    }, text));
  }

  /** setValue + fireChange on the n-th control of a type (what typing + leaving the field does). */
  async setValue(type, index, value) {
    await this.withControls((cs, [ty, i, v]) => {
      const c = cs.filter((x) => x.getMetadata().getName() === ty && x.getDomRef())[i];
      if (!c) throw new Error(`no ${ty} #${i}`);
      c.setValue(v);
      c.fireChange({ value: v });
    }, [type, index, value]);
  }

  /** setValue + fireChange on the control of a type whose `value` is bound to `path`. */
  async setBound(type, path, value) {
    await this.withControls((cs, [ty, p, v]) => {
      const c = cs.find((x) => x.getMetadata().getName() === ty && x.getBinding('value') && x.getBinding('value').getPath() === p && x.getDomRef());
      if (!c) throw new Error(`no ${ty} bound to ${p}`);
      c.setValue(v);
      c.fireChange({ value: v });
    }, [type, path, value]);
  }

  /** set a property through its setter (with the two-way binding update) and fire an event. */
  async setAndFire(type, index, prop, value, event, params = {}) {
    await this.withControls((cs, [ty, i, p, v, ev, par]) => {
      const c = cs.filter((x) => x.getMetadata().getName() === ty && x.getDomRef())[i];
      if (!c) throw new Error(`no ${ty} #${i}`);
      c.setProperty(p, v);
      if (ev) c.fireEvent(ev, par);
    }, [type, index, prop, value, event, params]);
  }
}

export const test = base.extend({
  wc: async ({ page }, use) => { await use(new Wc(page)); },
  ui5: async ({ browser }, use, testInfo) => {
    const ctx = await browser.newContext({ bypassCSP: true, baseURL: testInfo.project.use.baseURL, viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await use(new Ui5(page));
    await ctx.close();
  },
});

export { expect };
export const CROSS = process.env.CROSS_CHECK !== '0';
