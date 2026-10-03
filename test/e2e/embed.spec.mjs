/*
 * <abap2ui5-app> embedded in a page of its own (dist/examples/plain.html):
 * two apps side by side, each its own backend session, events to the host,
 * a theme per element, and a restart when the `app` attribute changes.
 */
import { test, expect, roundtrip } from './fixtures.mjs';

test('two embedded apps, independent sessions, host events, app switch', async ({ page }) => {
  await page.route('**://cdn.jsdelivr.net/**', (r) => r.abort());
  const responses = [];
  await page.exposeFunction('a2uSeen', (d) => responses.push(d));
  await page.addInitScript(() => document.addEventListener('abap2ui5-response', (e) => window.a2uSeen({ id: e.target.id, app: e.detail.app })));
  await page.goto('/examples/plain.html');
  const left = page.locator('#left');
  const right = page.locator('#right');
  await expect(left.locator('[data-ui5-control="sap.m.Input"]')).toHaveJSProperty('value', 'World');
  await expect(right.locator('ui5-table-row')).toHaveCount(6);
  expect(responses.map((r) => r.id).sort()).toEqual(['left', 'right']);

  // the left app's edit stays in the left session
  await left.locator('[data-ui5-control="sap.m.Input"] input').fill('Embedded');
  await left.locator('[data-ui5-control="sap.m.Input"] input').press('Tab');
  const greet = await roundtrip(page, () => left.locator('ui5-button').filter({ hasText: 'Greet' }).click());
  expect(greet.request.MODEL).toEqual({ NAME: 'Embedded' });
  expect(greet.request.S_FRONT.PATHNAME).toBeUndefined();
  await expect(left.locator('[data-ui5-control="sap.m.Text"]').nth(1)).toHaveText('Hello Embedded!');
  const leftId = greet.request.S_FRONT.ID;
  // the message box is modal for the whole page - close it first
  await left.locator('ui5-dialog.a2u-messagebox ui5-button').click();
  // the narrow column moves toolbar buttons into the toolbar's overflow
  const editBtn = right.locator('ui5-toolbar-button[text="edit"]');
  if (!(await editBtn.isVisible())) await right.locator('ui5-toolbar .ui5-tb-overflow-btn').click();
  const edit = await roundtrip(page, () => editBtn.click());
  expect(edit.request.S_FRONT.ID).not.toBe(leftId);
  await expect(right.locator('ui5-table-row').first().locator('ui5-input').first()).not.toHaveAttribute('disabled', '');


  // changing `app` restarts the element with another app
  const restart = await roundtrip(page, () => page.evaluate(() => document.getElementById('left').setAttribute('app', 'Z2UI5_CL_SMP_APP_493')));
  expect(restart.request.S_FRONT.SEARCH).toBe('?app_start=Z2UI5_CL_SMP_APP_493');
  expect(restart.request.S_FRONT.PATHNAME).toBe('/sap/bc/z2ui5/');
  await expect(left.locator('[data-ui5-control="sap.m.Title"]')).toHaveText('Hello World');
  await expect(right.locator('ui5-table-row')).toHaveCount(6);
});

test('the standalone page passes extra URL parameters and reports a backend error', async ({ page }) => {
  await page.route('**://cdn.jsdelivr.net/**', (r) => r.abort());
  const start = page.waitForRequest((r) => r.method() === 'POST');
  await page.goto('/?app_start=Z2UI5_CL_SMP_APP_493&foo=bar');
  const body = JSON.parse((await start).postData()).value;
  expect(body.S_FRONT.SEARCH).toBe('?app_start=Z2UI5_CL_SMP_APP_493&foo=bar');
  expect(body.S_FRONT.CONFIG.S_DEVICE.SYSTEM).toBe('desktop');
  await expect(page.locator('abap2ui5-app [data-ui5-control="sap.m.Title"]')).toHaveText('Hello World');

  await page.goto('/?app_start=Z2UI5_CL_DOES_NOT_EXIST');
  const err = page.locator('abap2ui5-app ui5-dialog.a2u-error');
  await expect(err).toHaveAttribute('header-text', /App Terminated|Error/);
  await expect(err.locator('.a2u-error-text')).not.toBeEmpty();
});
