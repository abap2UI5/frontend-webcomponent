/*
 * sap.m.Dialog -> ui5-dialog, sap.m.Popover / ResponsivePopover -> ui5-popover.
 *
 * They are rendered like any control; the slot manager (ui/app.js) opens
 * the one a POPUP / POPOVER display carries (the popover against the
 * element of the `openById` control) and closes it on a destroy.
 *
 * A web-component dialog closes itself on Escape. UI5 keeps the popup slot
 * open server-side until the app destroys it, so an Escape is cancelled
 * when the dialog wires no afterClose (the state stays in step with the
 * backend); with an afterClose wire the dialog closes and the wire fires.
 */
import { define } from '../registry.js';
import { VALUE_STATE, iconName } from './common.js';

const PLACEMENT = {
  Top: 'Top', Bottom: 'Bottom', Left: 'Start', Right: 'End', Begin: 'Start', End: 'End', Auto: 'End', Horizontal: 'End', Vertical: 'Bottom',
  PreferredTopOrFlip: 'Top', PreferredBottomOrFlip: 'Bottom', PreferredLeftOrFlip: 'Start', PreferredRightOrFlip: 'End', HorizontalPreferredLeft: 'Start', HorizontalPreferredRight: 'End', VerticalPreferredTop: 'Top', VerticalPreferredBottom: 'Bottom',
};

function footerBar(node, api, groups, el, names) {
  const present = names.filter((n) => groups.has(n));
  if (!present.length) return;
  if (present.length === 1 && present[0] === 'footer') {
    api.aggregation(node, 'footer', (kids) => kids.forEach((k) => { k.setAttribute('slot', 'footer'); el.appendChild(k); }), { groups });
    return;
  }
  const bar = api.el('ui5-bar', { slot: 'footer', design: 'Footer', class: 'a2u-dialog-footer' });
  for (const n of ['beginButton', 'endButton', 'buttons']) {
    if (!groups.has(n)) continue;
    api.aggregation(node, n, (kids) => kids.forEach((k) => { k.setAttribute('slot', 'endContent'); bar.appendChild(k); }), { groups });
  }
  el.appendChild(bar);
}

function closeWiring(el, node, api, wired) {
  el.addEventListener('before-close', (ev) => {
    if (el.__a2uClosing) return;
    if (ev.detail && ev.detail.escPressed && !wired) ev.preventDefault();
  });
  el.__a2uWired = wired;
}

define('sap.m.Dialog', {
  wc: '`ui5-dialog` + `ui5-bar` footer',
  render(node, api) {
    const el = api.el('ui5-dialog', { class: 'a2u-dialog' });
    const a = node.attrs;
    const groups = api.renderer.groups(node, { defaultAggregation: 'content' });
    const showHeader = a.showHeader === undefined || api.toBool(api.evaluate(a.showHeader));
    if (groups.has('customHeader') || groups.has('subHeader')) {
      for (const n of ['customHeader', 'subHeader']) {
        if (groups.has(n)) api.aggregation(node, n, (kids) => kids.forEach((k) => { k.setAttribute('slot', 'header'); el.appendChild(k); }), { groups });
      }
    } else if (showHeader && a.icon !== undefined) {
      const head = api.el('div', { slot: 'header', class: 'a2u-dialog-header' });
      const ic = api.el('ui5-icon');
      const t = api.el('ui5-title', { level: 'H1', size: 'H5' });
      head.append(ic, t);
      api.bind(a.icon, (v) => ic.setAttribute('name', iconName(v)));
      api.bind(a.title ?? '', (v) => { t.textContent = v ?? ''; });
      el.appendChild(head);
    } else if (showHeader) {
      api.bind(a.title ?? '', (v) => (v ? el.setAttribute('header-text', v) : el.removeAttribute('header-text')));
    }
    const content = api.el('div', { class: 'a2u-dialog-content' });
    if (a.contentWidth !== undefined) api.bind(a.contentWidth, (v) => { content.style.width = v || ''; });
    if (a.contentHeight !== undefined) api.bind(a.contentHeight, (v) => { content.style.height = v || ''; });
    if (a.verticalScrolling !== undefined) api.bind(a.verticalScrolling, (v) => { content.style.overflowY = api.toBool(v) ? 'auto' : 'hidden'; });
    if (a.horizontalScrolling !== undefined) api.bind(a.horizontalScrolling, (v) => { content.style.overflowX = api.toBool(v) ? 'auto' : 'hidden'; });
    api.aggregation(node, 'content', (kids) => kids.forEach((k) => content.appendChild(k)), { groups });
    el.appendChild(content);
    footerBar(node, api, groups, el, ['beginButton', 'endButton', 'buttons', 'footer']);
    if (a.state !== undefined) api.bind(a.state, (v) => el.setAttribute('state', VALUE_STATE[v] || 'None'));
    if (a.stretch !== undefined) api.bind(a.stretch, (v) => el.toggleAttribute('stretch', api.toBool(v)));
    if (a.draggable !== undefined) api.bind(a.draggable, (v) => el.toggleAttribute('draggable', api.toBool(v)));
    if (a.resizable !== undefined) api.bind(a.resizable, (v) => el.toggleAttribute('resizable', api.toBool(v)));
    closeWiring(el, node, api, !!a.afterClose);
    if (a.afterClose) api.wire(el, 'afterClose', { on: 'close', filter: () => !el.__a2uClosing, params: () => ({ origin: null }) });
    return el;
  },
  defaultAggregation: 'content',
  read: { title: (el) => el.getAttribute('header-text') || '' },
  status: 'basic',
  note: 'title, icon, state, content size, buttons/begin/endButton/footer, custom header, afterClose; type Message not distinguished',
});

function popover(node, api) {
  const el = api.el('ui5-popover', { class: 'a2u-popover' });
  const a = node.attrs;
  const groups = api.renderer.groups(node, { defaultAggregation: 'content' });
  const showHeader = a.showHeader === undefined || api.toBool(api.evaluate(a.showHeader));
  if (groups.has('customHeader')) {
    api.aggregation(node, 'customHeader', (kids) => kids.forEach((k) => { k.setAttribute('slot', 'header'); el.appendChild(k); }), { groups });
  } else if (showHeader) {
    api.bind(a.title ?? '', (v) => (v ? el.setAttribute('header-text', v) : el.removeAttribute('header-text')));
  }
  api.bind(a.placement ?? 'Right', (v) => el.setAttribute('placement', PLACEMENT[v] || 'End'));
  if (a.modal !== undefined) api.bind(a.modal, (v) => el.toggleAttribute('modal', api.toBool(v)));
  const content = api.el('div', { class: 'a2u-popover-content' });
  if (a.contentWidth !== undefined) api.bind(a.contentWidth, (v) => { content.style.width = v || ''; });
  if (a.contentHeight !== undefined) api.bind(a.contentHeight, (v) => { content.style.height = v || ''; });
  api.aggregation(node, 'content', (kids) => kids.forEach((k) => content.appendChild(k)), { groups });
  el.appendChild(content);
  footerBar(node, api, groups, el, ['beginButton', 'endButton', 'footer']);
  el.__a2uWired = true;
  if (a.afterClose) api.wire(el, 'afterClose', { on: 'close', filter: () => !el.__a2uClosing, params: () => ({}) });
  return el;
}

define('sap.m.Popover', { render: popover, defaultAggregation: 'content', status: 'basic', note: 'title, placement, modal, content size, footer, afterClose' });
define('sap.m.ResponsivePopover', { render: popover, defaultAggregation: 'content', status: 'basic', note: 'as Popover (no phone-fullscreen variant)' });
