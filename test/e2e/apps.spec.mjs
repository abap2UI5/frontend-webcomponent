/*
 * Every demo app in the web-components frontend: interact, assert the DOM
 * and the backend state (the roundtrip bodies), and - the cross-check - do
 * the same in the official UI5 SPA against the same backend and compare
 * what the two frontends sent.
 */
import { test, expect, roundtrip, toastText, boxText, CROSS } from './fixtures.mjs';

test.describe('Z2UI5_CL_SMP_APP_493 hello world', () => {
  test('renders shell, page, strip and title', async ({ wc }) => {
    await wc.open('Z2UI5_CL_SMP_APP_493');
    await expect(wc.control('sap.m.Page').locator('.a2u-page-title')).toHaveText('abap2UI5 - Basics I - Hello World, the Smallest App');
    await expect(wc.control('sap.m.Title')).toHaveText('Hello World');
    await expect(wc.control('sap.m.MessageStrip')).toContainText('The whole app is what you see below');
    await expect(wc.control('sap.m.MessageStrip')).toHaveAttribute('design', 'Information');
    await expect(wc.page.locator('abap2ui5-app .a2u-nav-back')).toBeHidden();
    expect(wc.severe()).toEqual([]);
  });
});

test.describe('Z2UI5_CL_SMP_APP_494 data binding', () => {
  const run = async (side, typeName) => {
    await typeName();
    return side.press('Greet');
  };

  test('two-way binding, delta and message box', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_494');
    const input = wc.control('sap.m.Input');
    await expect(input).toHaveJSProperty('value', 'World');
    const texts = wc.control('sap.m.Text');
    const { request, response } = await run(wc, async () => {
      await wc.fill(input, 'Alice');
      // the Text bound to the same attribute follows without a roundtrip
      await expect(texts.nth(0)).toHaveText('Alice');
    });
    expect(request.MODEL).toEqual({ NAME: 'Alice' });
    expect(request.S_FRONT.EVENT).toBe('GREET');
    expect(response.MODEL.GREETING).toBe('Hello Alice!');
    expect(boxText(response)).toContain("NAME = 'Alice'");
    await expect(texts.nth(1)).toHaveText('Hello Alice!');
    const box = wc.page.locator('abap2ui5-app ui5-dialog.a2u-messagebox');
    await expect(box).toContainText("the backend read NAME = 'Alice'");
    await box.locator('ui5-button[data-action="OK"]').click();
    await expect(box).toHaveCount(0);
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_494');
    const u = await run(ui5, () => ui5.setValue('sap.m.Input', 0, 'Alice'));
    expect(ui5.rec.events()).toEqual(wc.rec.events());
    expect(u.response.MODEL).toEqual(response.MODEL);
  });
});

test.describe('Z2UI5_CL_SMP_APP_381 message toast', () => {
  test('toast from the backend with options, onClose event, client-composed toast', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_381');
    const inputs = wc.control('sap.m.Input');
    await wc.fill(inputs.nth(0), 'Hi there');
    const at = wc.control('sap.m.Select').nth(1);
    await at.click();
    await at.locator('ui5-option').filter({ hasText: /^center top$/ }).click();
    await expect(at).toHaveJSProperty('selectedOption.textContent', 'center top');
    const { request, response } = await wc.press('Show Message Toast');
    expect(request.MODEL).toMatchObject({ MESSAGE: 'Hi there', AT: 'center top' });
    expect(toastText(response)).toBe('Hi there');
    const toast = wc.page.locator('abap2ui5-app ui5-toast');
    await expect(toast).toHaveText('Hi there');
    // the toast closes after its duration and reports the onClose event
    const closed = await roundtrip(wc.page, async () => {});
    expect(closed.request.S_FRONT.EVENT).toBe('TOAST_CLOSED');
    await expect(wc.control('sap.m.Text').filter({ hasText: 'toast closed' })).toHaveText(/toast closed 1 time\(s\)/);
    // a wired eF toast, composed on the client from ${$source>/text}: no roundtrip
    const before = wc.rec.exchanges.length;
    await wc.button('Compose on the client').click();
    await expect(wc.page.locator('abap2ui5-app ui5-toast').last()).toHaveText('Compose on the client - composed on the client, the backend never saw this press');
    expect(wc.rec.exchanges.length).toBe(before);
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_381');
    await ui5.setValue('sap.m.Input', 0, 'Hi there');
    await ui5.setAndFire('sap.m.Select', 1, 'selectedKey', 'center top', 'change', {});
    const u = await ui5.press('Show Message Toast');
    expect(toastText(u.response)).toBe('Hi there');
    await roundtrip(ui5.page, async () => {});
    expect(ui5.rec.events()).toEqual(wc.rec.events());
  });
});

test.describe('Z2UI5_CL_SMP_APP_382 message box', () => {
  test('box types, details, custom actions', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_382');
    await wc.fill(wc.control('sap.m.Input').nth(1), 'Really?');
    const { request, response } = await wc.press('Confirm');
    expect(request.MODEL).toEqual({ MESSAGE: 'Really?' });
    expect(boxText(response)).toBe('Really?');
    const box = wc.page.locator('abap2ui5-app ui5-dialog.a2u-messagebox');
    await expect(box).toHaveAttribute('header-text', 'abap2UI5');
    await expect(box.locator('.a2u-box-text')).toHaveText('Really?');
    await expect(box.locator('.a2u-box-details')).toContainText('additional details');
    await expect(box.locator('ui5-button')).toHaveText(['OK', 'Cancel']);
    await box.locator('ui5-button[data-action="CANCEL"]').click();
    await expect(box).toHaveCount(0);
    await wc.press('Error');
    await expect(box).toHaveAttribute('state', 'Negative');
    await box.locator('ui5-button[data-action="OK"]').click();
    await wc.press('Custom');
    await expect(box.locator('ui5-button')).toHaveText(['Approve', 'Reject']);
    await expect(box.locator('ui5-button[data-action="Approve"]')).toHaveAttribute('design', 'Emphasized');
    await box.locator('ui5-button[data-action="Reject"]').click();
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_382');
    await ui5.setValue('sap.m.Input', 1, 'Really?');
    const u = await ui5.press('Confirm');
    expect(u.response.S_FRONT.S_ACTION.T_CUSTOM).toEqual(response.S_FRONT.S_ACTION.T_CUSTOM);
    expect(ui5.rec.events()[0]).toEqual(wc.rec.events()[0]);
  });
});

test.describe('Z2UI5_CL_SMP_APP_011 editable table', () => {
  test('edit mode, cell edit, row selection, delete and add', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_011');
    const rows = wc.page.locator('abap2ui5-app ui5-table-row');
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(0).locator('ui5-input').first()).toHaveAttribute('disabled', '');
    const edit = await wc.press('edit');
    expect(edit.response.MODEL.T_TAB.every((r) => r.EDITABLE === true)).toBe(true);
    await expect(rows.nth(0).locator('ui5-input').first()).not.toHaveAttribute('disabled', '');
    await wc.fill(rows.nth(0).locator('ui5-input').first(), 'changed title');
    // select rows 1 and 3 through the table's selection checkboxes
    await rows.nth(1).locator('#selection-component').click();
    await rows.nth(3).locator('#selection-component').click();
    const del = await wc.press('delete selected row');
    expect(del.request.MODEL).toEqual({
      T_TAB: { __delta: { 0: { TITLE: 'changed title' }, 1: { SELKZ: true }, 3: { SELKZ: true } } },
    });
    expect(del.response.MODEL.T_TAB.map((r) => r.TITLE)).toEqual(['changed title', 'entry 03', 'entry 05', '']);
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1).locator('ui5-input').first()).toHaveJSProperty('value', 'entry 03');
    const add = await wc.press('add');
    expect(add.response.MODEL.T_TAB).toHaveLength(5);
    await expect(rows).toHaveCount(5);
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_011');
    await ui5.press('edit');
    await ui5.setValue('sap.m.Input', 0, 'changed title');
    await ui5.withControls((cs) => {
      const items = cs.filter((c) => c.getMetadata().getName() === 'sap.m.ColumnListItem' && c.getDomRef());
      const table = cs.find((c) => c.getMetadata().getName() === 'sap.m.Table');
      for (const i of [1, 3]) {
        items[i].setSelected(true);
        table.fireSelectionChange({ listItem: items[i], selected: true });
      }
    });
    const u = await ui5.press('delete selected row');
    expect(u.request.MODEL).toEqual(del.request.MODEL);
    expect(u.response.MODEL).toEqual(del.response.MODEL);
  });
});

test.describe('Z2UI5_CL_SMP_APP_019 table selection modes', () => {
  test('segmented button switches the mode, the selection travels as SELKZ', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_019');
    const seg = wc.control('sap.m.SegmentedButton');
    const change = await roundtrip(wc.page, () => seg.locator('ui5-segmented-button-item').filter({ hasText: /^MultiSelect$/ }).click());
    expect(change.request.MODEL).toMatchObject({ SEL_MODE: 'MultiSelect' });
    expect(toastText(change.response)).toBe('Selection Mode changed');
    await expect(wc.page.locator('abap2ui5-app ui5-table-selection-multi')).toHaveCount(1);
    const rows = wc.control('sap.m.Table').first().locator('ui5-table-row');
    await rows.nth(0).locator('#selection-component').click();
    await rows.nth(2).locator('#selection-component').click();
    const read = await wc.press('copy selected entries');
    expect(read.response.MODEL.T_TAB_SEL.map((r) => r.TITLE)).toEqual([read.response.MODEL.T_TAB[0].TITLE, read.response.MODEL.T_TAB[2].TITLE]);
    await expect(wc.control('sap.m.Table').nth(1).locator('ui5-table-row')).toHaveCount(2);
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_019');
    await roundtrip(ui5.page, () => ui5.withControls((cs) => {
      const s = cs.find((c) => c.getMetadata().getName() === 'sap.m.SegmentedButton');
      const item = s.getItems().find((i) => i.getKey() === 'MultiSelect');
      s.setSelectedKey('MultiSelect');
      s.fireSelectionChange({ item });
    }));
    expect(ui5.rec.events()[0]).toEqual(wc.rec.events()[0]);
  });
});

test.describe('Z2UI5_CL_SMP_APP_048 list', () => {
  test('row event args from the item context, selection writes SELECTED', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_048');
    const items = wc.page.locator('abap2ui5-app ui5-li');
    await expect(items).toHaveCount(6);
    await expect(items.nth(1)).toHaveAttribute('additional-text-state', 'Positive');
    await expect(items.nth(1)).toHaveAttribute('icon', 'favorite');
    const sel = await roundtrip(wc.page, () => items.nth(2).click());
    expect(sel.request.S_FRONT.EVENT).toBe('SELCHANGE');
    expect(sel.request.MODEL).toEqual({ T_TAB: { __delta: { 2: { SELECTED: true } } } });
    expect(boxText(sel.response)).toBe('SELECTION_CHANGED - entry_03');
    await wc.page.locator('abap2ui5-app ui5-dialog.a2u-messagebox ui5-button').click();
    const det = await roundtrip(wc.page, () => items.nth(3).locator('ui5-button').last().click());
    expect(det.request.S_FRONT.EVENT).toBe('EDIT');
    expect(det.request.S_FRONT.T_EVENT_ARG).toEqual(['entry_04', 'this is a description4 1234567890 1234567890', 'sap-icon://accept', 'Error', 'Error', false]);
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_048');
    const u = await roundtrip(ui5.page, () => ui5.withControls((cs) => {
      const list = cs.find((c) => c.getMetadata().getName() === 'sap.m.List');
      const it = list.getItems()[2];
      list.setSelectedItem(it, true, true);
    }));
    expect(u.request.MODEL).toEqual(sel.request.MODEL);
    expect(boxText(u.response)).toBe(boxText(sel.response));
  });
});

test.describe('Z2UI5_CL_SMP_APP_012 popups', () => {
  test('popup over the page, decide with a roundtrip; info popup closed on the client', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_012');
    const open = await wc.press('popup, background unchanged (default) - close with server');
    expect(open.response.S_FRONT.S_ACTION.T_SYSTEM.some((a) => a[1] === 'display' && a[2] === 'POPUP')).toBe(true);
    const dialog = wc.page.locator('abap2ui5-app .a2u-overlays ui5-dialog[data-slot="POPUP"]');
    await expect(dialog).toHaveAttribute('header-text', 'Popup - Decide');
    await expect(dialog).toHaveJSProperty('open', true);
    await expect(dialog.locator('ui5-text')).toHaveText('this is a popup to decide, you have to make a decision now...');
    const cont = await wc.press('Continue', dialog);
    expect(cont.request.S_FRONT.EVENT).toBe('POPUP_DECIDE_CONTINUE');
    expect(toastText(cont.response)).toBe('continue pressed');
    await expect(dialog).toHaveCount(0);
    await expect(wc.page.locator('abap2ui5-app ui5-toast')).toHaveText('continue pressed');
    // the info popup closes with an eF wire: no roundtrip
    await wc.press('popup, background unchanged (default) - close (no roundtrip)');
    await expect(dialog).toHaveAttribute('header-text', 'Popup - Info');
    const before = wc.rec.exchanges.length;
    await wc.button('close', dialog).click();
    await expect(dialog).toHaveCount(0);
    expect(wc.rec.exchanges.length).toBe(before);
    // a popup that is its own app (nav_app_call to z2ui5_cl_smp_app_020)
    await wc.press('popup rendering, hold previous view');
    await expect(dialog).toContainText('(new app) this is a popup to decide');
    const cancel = await wc.press('Cancel', dialog);
    // the popup app hands its event name back to the caller, which toasts it
    expect(toastText(cancel.response)).toBe('POPUP_DECIDE_CANCEL pressed');
    await expect(dialog).toHaveCount(0);
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_012');
    await ui5.press('popup, background unchanged (default) - close with server');
    const u = await ui5.press('Continue');
    expect(toastText(u.response)).toBe('continue pressed');
    expect(ui5.rec.events()).toEqual(wc.rec.events().slice(0, 2));
  });
});

test.describe('Z2UI5_CL_SMP_APP_026 popover', () => {
  test('popover at its opener, input inside, confirm', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_026');
    // the segmented button has no event: the selection waits in the model for the next roundtrip
    await wc.control('sap.m.SegmentedButton').locator('ui5-segmented-button-item').filter({ hasText: /^Top$/ }).click();
    const show = await wc.press('show');
    expect(show.request.MODEL).toMatchObject({ PLACEMENT: 'Top' });
    const pop = wc.page.locator('abap2ui5-app ui5-popover[data-slot="POPOVER"]');
    await expect(pop).toHaveJSProperty('open', true);
    await expect(pop).toHaveAttribute('header-text', 'Popover Title');
    await expect(pop).toHaveAttribute('placement', 'Top');
    expect(await pop.evaluate((p) => p.opener && p.opener.getAttribute('data-ui5-id'))).toBe('TEST');
    await wc.fill(pop.locator('ui5-input'), 'from the popover');
    const ok = await wc.press('Confirm', pop);
    expect(ok.request.MODEL).toEqual({ INPUT: 'from the popover' });
    expect(toastText(ok.response)).toBe('confirm - input: from the popover');
    await expect(pop).toHaveCount(0);
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_026');
    await ui5.withControls((cs) => {
      const s = cs.find((c) => c.getMetadata().getName() === 'sap.m.SegmentedButton');
      s.setSelectedKey('Top');
    });
    await ui5.press('show');
    await ui5.setValue('sap.m.Input', 0, 'from the popover');
    const u = await ui5.press('Confirm');
    expect(u.request.MODEL).toEqual(ok.request.MODEL);
    expect(toastText(u.response)).toBe(toastText(ok.response));
  });
});

test.describe('Z2UI5_CL_SMP_APP_024 navigation', () => {
  test('call another app, return with data, back button', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_024');
    const nav = wc.page.locator('abap2ui5-app .a2u-nav-back');
    await expect(nav).toBeHidden();
    const call = await wc.press('call new app (first View)');
    expect(call.response.S_FRONT.APP).toBe('Z2UI5_CL_SMP_APP_025');
    await expect(wc.main()).toHaveAttribute('data-app', 'Z2UI5_CL_SMP_APP_025');
    await expect(nav).toBeVisible();
    await wc.fill(wc.control('sap.m.Input').last(), 'typed in 025');
    const back = await wc.press('back');
    expect(back.response.S_FRONT.APP).toBe('Z2UI5_CL_SMP_APP_024');
    expect(back.request.MODEL).toEqual({ INPUT: 'typed in 025' });
    expect(boxText(back.response)).toBe('Input made in the previous app: typed in 025');
    await expect(wc.page.locator('abap2ui5-app ui5-dialog.a2u-messagebox')).toContainText('typed in 025');
    await wc.page.locator('abap2ui5-app ui5-dialog.a2u-messagebox ui5-button').click();
    // the Page's back button fires the framework's leave event
    await wc.press('call new app (first View)');
    const leave = await roundtrip(wc.page, () => nav.click());
    expect(leave.request.S_FRONT.EVENT).toBe('___ZZZ_NAL');
    expect(leave.response.S_FRONT.APP).toBe('Z2UI5_CL_SMP_APP_024');
    await expect(nav).toBeHidden();
    expect(wc.severe()).toEqual([]);

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_024');
    await ui5.press('call new app (first View)');
    await ui5.setBound('sap.m.Input', '/INPUT', 'typed in 025');
    const u = await ui5.press('back');
    expect(boxText(u.response)).toBe(boxText(back.response));
    expect(ui5.rec.events()).toEqual(wc.rec.events().slice(0, 2));
  });
});

test.describe('Z2UI5_CL_SMP_APP_445 device model', () => {
  test('device> bindings, expressions, tabs, popup closed by an eF wire', async ({ wc }) => {
    await wc.open('Z2UI5_CL_SMP_APP_445');
    await expect(wc.control('sap.m.ObjectStatus').first()).toHaveText('Desktop');
    await expect(wc.control('sap.m.ObjectStatus').nth(2)).toHaveText('1280 x 800 px');
    await expect(wc.control('sap.m.MessageStrip').nth(1)).toHaveJSProperty('textContent', 'Full layout - tablet or desktop.');
    const tabs = wc.page.locator('abap2ui5-app ui5-tab');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.first()).toHaveJSProperty('selected', true);
    await wc.page.setViewportSize({ width: 500, height: 800 });
    await expect(wc.control('sap.m.ObjectStatus').first()).toHaveText('Phone');
    await wc.page.setViewportSize({ width: 1280, height: 800 });
    await wc.press('Open dialog (device model inside a popup)');
    const dialog = wc.page.locator('abap2ui5-app ui5-dialog[data-slot="POPUP"]');
    await expect(dialog).toHaveJSProperty('open', true);
    const before = wc.rec.exchanges.length;
    await dialog.locator('ui5-button').last().click();
    await expect(dialog).toHaveCount(0);
    expect(wc.rec.exchanges.length).toBe(before);
    expect(wc.severe()).toEqual([]);
  });
});

test.describe('Z2UI5_CL_SMP_APP_125 set title', () => {
  test('SET_TITLE sets the document title', async ({ wc, ui5 }) => {
    await wc.open('Z2UI5_CL_SMP_APP_125');
    await wc.fill(wc.control('sap.m.Input'), 'Hello from ABAP');
    const r = await wc.press('Set Title');
    expect(r.response.S_FRONT.S_ACTION.T_CUSTOM).toEqual([['SET_TITLE', 'Hello from ABAP']]);
    await expect(wc.page).toHaveTitle('Hello from ABAP');

    if (!CROSS) return;
    await ui5.open('Z2UI5_CL_SMP_APP_125');
    await ui5.setValue('sap.m.Input', 0, 'Hello from ABAP');
    await ui5.press('Set Title');
    await expect(ui5.page).toHaveTitle('Hello from ABAP');
    expect(ui5.rec.events()).toEqual(wc.rec.events());
  });
});

test.describe('Z2UI5_CL_SMP_APP_027 expression binding', () => {
  test('expressions, Math.max, typed inputs, composite parts - RegExp reported', async ({ wc }) => {
    await wc.open('Z2UI5_CL_SMP_APP_027');
    const inputs = wc.control('sap.m.Input');
    await wc.fill(inputs.nth(0), 'shout');
    await expect(inputs.nth(1)).toHaveJSProperty('value', 'SHOUT');
    await wc.fill(inputs.nth(2), '7');
    await wc.fill(inputs.nth(3), '42');
    await expect(inputs.nth(4)).toHaveJSProperty('value', '42');
    await expect(inputs.nth(6)).not.toHaveAttribute('disabled', '');
    await wc.fill(inputs.nth(5), '499');
    await expect(inputs.nth(6)).toHaveAttribute('disabled', '');
    await wc.fill(inputs.nth(8), 'left');
    await wc.fill(inputs.nth(9), 'right');
    await expect(inputs.nth(10)).toHaveJSProperty('value', 'left right');
    // typed bindings write numbers into the model
    const models = await wc.page.evaluate(() => document.querySelector('abap2ui5-app').session.models.MAIN.data);
    expect(models).toMatchObject({ INPUT31: 7, INPUT32: 42, QUANTITY: 499, INPUT2: 'shout' });
    // RegExp() is outside the portable profile: reported, not evaluated
    expect(wc.severe().some((i) => /expression .*RegExp/.test(i))).toBe(true);
    await expect(wc.page.locator('abap2ui5-app .a2u-diagnostics')).toBeVisible();
  });
});

test.describe('Z2UI5_CL_SMP_APP_453 ObjectStatus / ObjectNumber', () => {
  test('semantic states and units', async ({ wc }) => {
    await wc.open('Z2UI5_CL_SMP_APP_453');
    const first = wc.page.locator('abap2ui5-app ui5-table-row').first();
    await expect(first.locator('.a2u-number').first()).toHaveText('650 g');
    await expect(first.locator('.a2u-number').first()).toHaveClass(/a2u-state-Positive/);
    await expect(first.locator('.a2u-number').nth(1)).toHaveText('249.99 EUR');
    await expect(first.locator('.a2u-status').first()).toHaveText('Available');
    await expect(first.locator('.a2u-status ui5-icon').first()).toHaveAttribute('name', 'accept');
    await expect(wc.page.locator('abap2ui5-app ui5-table-row').nth(1).locator('.a2u-status').nth(1)).toHaveClass(/a2u-state-Negative/);
    expect(wc.severe()).toEqual([]);
  });
});
