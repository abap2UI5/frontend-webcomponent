/*
 * Display controls: text, titles, buttons, links, icons, messages, status.
 */
import { define } from '../registry.js';
import {
  VALUE_STATE, BUTTON_DESIGN, iconName, enabled, text, icon, sanitizeHtml, cssSize,
} from './common.js';

const TITLE_LEVEL = { H1: 'H1', H2: 'H2', H3: 'H3', H4: 'H4', H5: 'H5', H6: 'H6', Auto: 'H2' };

define('sap.m.Title', {
  tag: 'ui5-title',
  props: {
    text,
    level: { attr: 'level', map: TITLE_LEVEL, mapDefault: 'H2' },
    titleStyle: { attr: 'size', map: TITLE_LEVEL, mapDefault: 'H5' },
    wrapping: { set: (el, v, api) => el.setAttribute('wrapping-type', api.toBool(v) ? 'Normal' : 'None') },
    textAlign: { style: 'textAlign' },
  },
  aggregations: { content: {} },
  read: { text: (el) => el.textContent },
  init: (el) => el.setAttribute('size', 'H5'),
});

define('sap.ui.core.Title', {
  tag: 'ui5-title',
  props: { text, level: { attr: 'level', map: TITLE_LEVEL, mapDefault: 'H3' }, icon: 'ignore' },
  init: (el) => {
    el.setAttribute('level', 'H3');
    el.setAttribute('size', 'H5');
  },
  read: { text: (el) => el.textContent },
  status: 'basic',
  note: 'icon not shown',
});

define('sap.m.Text', {
  tag: 'ui5-text',
  props: {
    text,
    maxLines: { attr: 'max-lines' },
    wrapping: { set: (el, v, api) => { el.style.whiteSpace = api.toBool(v) || v === undefined ? '' : 'nowrap'; } },
    renderWhitespace: { set: (el, v, api) => { if (api.toBool(v)) el.style.whiteSpace = 'pre-wrap'; } },
    textAlign: { style: 'textAlign' },
    emptyIndicatorMode: { attr: 'empty-indicator-mode' },
  },
  read: { text: (el) => el.textContent },
});

define('sap.m.Label', {
  tag: 'ui5-label',
  props: {
    text,
    required: { attr: 'required', bool: true },
    showColon: { attr: 'show-colon', bool: true },
    wrapping: { set: (el, v, api) => el.setAttribute('wrapping-type', api.toBool(v) ? 'Normal' : 'None') },
    labelFor: { set: (el, v, api) => { if (v) el.setAttribute('for', `${api.ctx.slot}--${v}`); } },
    design: { set: (el, v) => { el.style.fontWeight = v === 'Bold' ? 'bold' : ''; } },
    textAlign: { style: 'textAlign' },
    vAlign: 'ignore',
  },
  read: { text: (el) => el.textContent },
});

define('sap.m.Link', {
  tag: 'ui5-link',
  props: {
    text,
    href: { set: (el, v) => (v && !/^\s*javascript:/i.test(v) ? el.setAttribute('href', v) : el.removeAttribute('href')) },
    target: { attr: 'target' },
    enabled,
    emphasized: { set: (el, v, api) => { if (api.toBool(v)) el.setAttribute('design', 'Emphasized'); } },
    subtle: { set: (el, v, api) => { if (api.toBool(v)) el.setAttribute('design', 'Subtle'); } },
    wrapping: { set: (el, v, api) => el.setAttribute('wrapping-type', api.toBool(v) ? 'Normal' : 'None') },
    textAlign: { style: 'textAlign' },
    icon: { attr: 'icon', convert: iconName },
    endIcon: { attr: 'end-icon', convert: iconName },
  },
  events: { press: { on: 'click', params: () => ({}) } },
  read: { text: (el) => el.textContent, href: (el) => el.getAttribute('href') || '' },
});

define('sap.m.Button', {
  tag: 'ui5-button',
  props: {
    text,
    icon,
    type: { attr: 'design', map: BUTTON_DESIGN, mapDefault: 'Default' },
    enabled,
    tooltip: { attr: 'tooltip' },
    iconFirst: { set: (el, v, api) => { if (v !== undefined && !api.toBool(v) && el.getAttribute('icon')) { el.setAttribute('end-icon', el.getAttribute('icon')); el.removeAttribute('icon'); } } },
    width: { style: 'width' },
    ariaHasPopup: 'ignore',
    activeIcon: 'ignore',
  },
  events: { press: { on: 'click', params: () => ({}) } },
  read: { text: (el) => el.textContent, icon: (el) => (el.getAttribute('icon') ? `sap-icon://${el.getAttribute('icon')}` : ''), enabled: (el) => !el.disabled },
});

define('sap.m.ToggleButton', {
  tag: 'ui5-toggle-button',
  props: {
    text, icon, enabled,
    type: { attr: 'design', map: BUTTON_DESIGN },
    pressed: { attr: 'pressed', bool: true, twoWay: { event: 'click', read: (el) => el.pressed } },
    tooltip: { attr: 'tooltip' },
  },
  events: { press: { on: 'click', params: (ev, el) => ({ pressed: el.pressed }) } },
  read: { text: (el) => el.textContent, pressed: (el) => el.pressed },
});

define('sap.ui.core.Icon', {
  tag: 'ui5-icon',
  props: {
    src: { attr: 'name', convert: iconName },
    size: { set: (el, v) => { const s = cssSize(v); el.style.width = s; el.style.height = s; el.style.fontSize = s; } },
    color: {
      set: (el, v) => {
        const sem = { Default: 'Default', Positive: 'Positive', Negative: 'Negative', Critical: 'Critical', Neutral: 'Neutral', Contrast: 'Contrast', Marker: 'Information', Tile: 'Default', NonInteractive: 'NonInteractive' };
        if (sem[v]) el.setAttribute('design', sem[v]);
        else if (v) el.style.color = String(v);
      },
    },
    decorative: { set: (el, v, api) => { if (!api.toBool(v) && el.getAttribute('mode') !== 'Interactive') el.setAttribute('mode', 'Image'); } },
    tooltip: { set: (el, v) => { if (v) { el.setAttribute('accessible-name', v); el.setAttribute('show-tooltip', ''); } } },
    alt: { attr: 'accessible-name' },
    useIconTooltip: 'ignore',
    backgroundColor: { style: 'backgroundColor' },
    width: { style: 'width' },
    height: { style: 'height' },
  },
  events: { press: { on: 'click', params: () => ({}) } },
  init: (el, node) => { if (node.attrs.press) el.setAttribute('mode', 'Interactive'); },
  read: { src: (el) => `sap-icon://${el.getAttribute('name') || ''}` },
});

define('sap.m.Image', {
  tag: 'img',
  props: {
    src: { set: (el, v) => (v && /^(https?:|data:image\/|\/|\.|[\w-]+[/.])/i.test(String(v)) ? el.setAttribute('src', v) : el.removeAttribute('src')) },
    alt: { attr: 'alt' },
    width: { style: 'width' },
    height: { style: 'height' },
    decorative: 'ignore',
    densityAware: 'ignore',
    mode: 'ignore',
    lazyLoading: { set: (el, v, api) => { if (api.toBool(v)) el.setAttribute('loading', 'lazy'); } },
  },
  events: { press: { on: 'click', params: () => ({}) } },
  init: (el) => { el.className = 'a2u-image'; },
});

define('sap.m.BusyIndicator', {
  tag: 'ui5-busy-indicator',
  props: {
    text: { attr: 'text' },
    size: { attr: 'size', map: { Small: 'S', Medium: 'M', Large: 'L' }, convert: (v) => (/^[SML]$/.test(v) ? v : (parseFloat(v) < 1.5 ? 'S' : parseFloat(v) > 3 ? 'L' : 'M')) },
    customIcon: 'ignore',
  },
  init: (el) => { el.setAttribute('active', ''); el.setAttribute('size', 'M'); },
});

const STRIP_DESIGN = { Information: 'Information', Success: 'Positive', Warning: 'Critical', Error: 'Negative', None: 'Information' };
define('sap.m.MessageStrip', {
  tag: 'ui5-message-strip',
  props: {
    text,
    type: { attr: 'design', map: STRIP_DESIGN, mapDefault: 'Information' },
    showIcon: { attr: 'hide-icon', bool: true, invert: true },
    showCloseButton: { attr: 'hide-close-button', bool: true, invert: true },
    enableFormattedText: 'ignore',
    customIcon: 'ignore',
  },
  events: { close: { on: 'close', params: () => ({}) } },
  aggregations: { link: {} },
  init: (el) => {
    el.setAttribute('design', 'Information');
    el.setAttribute('hide-icon', '');
    el.setAttribute('hide-close-button', '');
    el.addEventListener('close', () => { el.style.display = 'none'; });
  },
  read: { text: (el) => el.textContent },
});

/* ObjectStatus / ObjectNumber: semantic text, no web component of their own. */
const stateClass = (el, v) => {
  for (const c of [...el.classList]) if (c.startsWith('a2u-state-')) el.classList.remove(c);
  if (v && v !== 'None') el.classList.add(`a2u-state-${VALUE_STATE[v] || v}`);
};

define('sap.m.ObjectStatus', {
  render(node, api) {
    const el = api.el('span', { class: 'a2u-status' });
    const ic = api.el('ui5-icon', { class: 'a2u-status-icon' });
    const title = api.el('span', { class: 'a2u-status-title' });
    const txt = api.el('span', { class: 'a2u-status-text' });
    el.append(ic, title, txt);
    const a = node.attrs;
    api.bind(a.icon, (v) => { ic.setAttribute('name', iconName(v)); ic.style.display = v ? '' : 'none'; });
    api.bind(a.title, (v) => { title.textContent = v ? `${v}: ` : ''; });
    api.bind(a.text, (v) => { txt.textContent = v ?? ''; });
    api.bind(a.state, (v) => stateClass(el, v));
    api.bind(a.inverted, (v) => el.classList.toggle('a2u-status-inverted', api.toBool(v)));
    if (a.active !== undefined) api.bind(a.active, (v) => el.classList.toggle('a2u-status-active', api.toBool(v)));
    if (a.press) api.wire(el, 'press', { on: 'click', params: () => ({}) });
    return el;
  },
  read: { text: (el) => el.querySelector('.a2u-status-text').textContent },
  status: 'basic',
  note: 'icon, title, text, state, inverted, active; no stateAnnouncementText',
});

define('sap.m.ObjectNumber', {
  render(node, api) {
    const el = api.el('span', { class: 'a2u-number' });
    const num = api.el('span', { class: 'a2u-number-value' });
    const unit = api.el('span', { class: 'a2u-number-unit' });
    el.append(num, unit);
    const a = node.attrs;
    api.bind(a.number, (v) => { num.textContent = v ?? ''; });
    api.bind(a.unit ?? a.numberUnit, (v) => { unit.textContent = v ? ` ${v}` : ''; });
    api.bind(a.state, (v) => stateClass(el, v));
    api.bind(a.emphasized ?? 'true', (v) => el.classList.toggle('a2u-number-emphasized', api.toBool(v)));
    api.bind(a.textAlign, (v) => { el.style.textAlign = v || ''; });
    return el;
  },
  read: { number: (el) => el.querySelector('.a2u-number-value').textContent },
  status: 'basic',
  note: 'number, unit, state, emphasized',
});

define('sap.m.ObjectIdentifier', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-identifier' });
    const a = node.attrs;
    const title = api.toBool(api.evaluate(a.titleActive ?? 'false')) ? api.el('ui5-link', { class: 'a2u-identifier-title' }) : api.el('div', { class: 'a2u-identifier-title' });
    const txt = api.el('div', { class: 'a2u-identifier-text' });
    el.append(title, txt);
    api.bind(a.title, (v) => { title.textContent = v ?? ''; title.style.display = v ? '' : 'none'; });
    api.bind(a.text, (v) => { txt.textContent = v ?? ''; txt.style.display = v ? '' : 'none'; });
    if (a.titlePress) api.wire(title, 'titlePress', { on: 'click', params: () => ({}) });
    return el;
  },
  status: 'basic',
});

define('sap.m.ObjectAttribute', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-attribute' });
    const a = node.attrs;
    const t = api.el('span', { class: 'a2u-attribute-title' });
    const v = api.toBool(api.evaluate(a.active ?? 'false')) ? api.el('ui5-link') : api.el('span');
    v.classList.add('a2u-attribute-text');
    el.append(t, v);
    api.bind(a.title, (x) => { t.textContent = x ? `${x}: ` : ''; });
    api.bind(a.text, (x) => { v.textContent = x ?? ''; });
    if (a.press) api.wire(v, 'press', { on: 'click', params: () => ({}) });
    return el;
  },
  status: 'basic',
});

define('sap.m.ObjectHeader', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-object-header' });
    const head = api.el('div', { class: 'a2u-object-header-head' });
    const title = api.el('ui5-title', { level: 'H3', size: 'H3' });
    const num = api.el('span', { class: 'a2u-number a2u-number-emphasized' });
    head.append(title, num);
    const body = api.el('div', { class: 'a2u-object-header-body' });
    el.append(head, body);
    const a = node.attrs;
    api.bind(a.title, (v) => { title.textContent = v ?? ''; });
    api.bind(a.number, (v) => { num.textContent = v ?? ''; });
    if (a.numberUnit) api.bind(a.numberUnit, (v) => { num.dataset.unit = v ?? ''; num.textContent = `${num.textContent.split(' ')[0]} ${v ?? ''}`; });
    if (a.numberState) api.bind(a.numberState, (v) => stateClass(num, v));
    const groups = api.renderer.groups(node, { defaultAggregation: 'attributes' });
    for (const agg of ['attributes', 'statuses', 'firstStatus', 'secondStatus']) {
      if (groups.has(agg) || node.attrs[agg]) api.aggregation(node, agg, (kids) => kids.forEach((k) => body.appendChild(k)), { groups });
    }
    return el;
  },
  status: 'basic',
  note: 'title, number, attributes and statuses; no intro, icon, markers',
});

define('sap.m.FormattedText', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-formatted' });
    api.bind(node.attrs.htmlText, (v) => { el.replaceChildren(sanitizeHtml(api.doc, v)); });
    return el;
  },
  status: 'basic',
  note: 'sanitized HTML; no controls aggregation',
});

define('sap.ui.core.HTML', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-html' });
    api.bind(node.attrs.content, (v) => { el.replaceChildren(sanitizeHtml(api.doc, v)); });
    return el;
  },
  status: 'basic',
  note: 'content sanitized: no script, no event handlers',
});

define('sap.ui.core.InvisibleText', { render: () => null, status: 'full' });

define('sap.m.Avatar', {
  tag: 'ui5-avatar',
  props: {
    initials: { attr: 'initials' },
    src: { set: (el, v, api) => {
      el.replaceChildren();
      if (!v) return;
      if (String(v).startsWith('sap-icon://')) el.setAttribute('icon', iconName(v));
      else el.appendChild(api.el('img', { src: v, alt: '' }));
    } },
    displaySize: { attr: 'size', map: { XS: 'XS', S: 'S', M: 'M', L: 'L', XL: 'XL', Custom: 'M' } },
    displayShape: { attr: 'shape', map: { Circle: 'Circle', Square: 'Square' } },
    backgroundColor: { attr: 'color-scheme', convert: (v) => (/^Accent\d+$/.test(v) ? v : 'Accent6') },
    tooltip: { attr: 'accessible-name' },
  },
  events: { press: { on: 'click', params: () => ({}) } },
  init: (el, node) => { if (node.attrs.press) el.setAttribute('interactive', ''); },
  status: 'basic',
});

define('sap.m.ProgressIndicator', {
  tag: 'ui5-progress-indicator',
  props: {
    percentValue: { attr: 'value' },
    displayValue: { attr: 'display-value' },
    showValue: { attr: 'hide-value', bool: true, invert: true },
    state: { attr: 'value-state', map: VALUE_STATE },
    enabled: 'ignore',
    displayOnly: 'ignore',
  },
});

define('sap.m.GenericTag', {
  tag: 'ui5-tag',
  props: {
    text,
    status: { attr: 'design', map: { None: 'Neutral', Success: 'Positive', Warning: 'Critical', Error: 'Negative', Information: 'Information' } },
    design: 'ignore',
  },
  events: { press: { on: 'click', params: () => ({}) } },
  init: (el, node) => { if (node.attrs.press) el.setAttribute('interactive', ''); },
  status: 'basic',
});

define('sap.m.ToolbarSpacer', { render: (node, api) => api.el('div', { class: 'a2u-toolbar-spacer', 'data-a2u-spacer': true }) });
define('sap.m.ToolbarSeparator', { render: (node, api) => api.el('div', { class: 'a2u-toolbar-separator', 'data-a2u-separator': true }) });
