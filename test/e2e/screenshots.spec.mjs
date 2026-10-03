/*
 * One screenshot per demo app into docs/screenshots/ (SCREENSHOTS=1,
 * `npm run screenshots`) - the pictures of the README.
 */
import fs from 'node:fs';
import { test, expect } from './fixtures.mjs';

const apps = JSON.parse(fs.readFileSync(new URL('../../demo/apps.json', import.meta.url), 'utf8')).classes;

test.describe('screenshots', () => {
  test.skip(!process.env.SCREENSHOTS, 'SCREENSHOTS=1 takes them');
  for (const { class: cls } of apps) {
    test(cls, async ({ wc }) => {
      await wc.open(cls);
      await wc.page.waitForTimeout(800);
      await expect(wc.main()).toBeVisible();
      await wc.page.screenshot({ path: `docs/screenshots/${cls.toLowerCase()}.png` });
    });
  }
});

test.describe('screenshots with an open popup', () => {
  test.skip(!process.env.SCREENSHOTS, 'SCREENSHOTS=1 takes them');
  test('popup and popover', async ({ wc }) => {
    await wc.open('Z2UI5_CL_SMP_APP_012');
    await wc.press('popup, background unchanged (default) - close with server');
    await wc.page.waitForTimeout(800);
    await wc.page.screenshot({ path: 'docs/screenshots/z2ui5_cl_smp_app_012-popup.png' });
    await wc.open('Z2UI5_CL_SMP_APP_026');
    await wc.press('show');
    await wc.page.waitForTimeout(800);
    await wc.page.screenshot({ path: 'docs/screenshots/z2ui5_cl_smp_app_026-popover.png' });
  });
});
