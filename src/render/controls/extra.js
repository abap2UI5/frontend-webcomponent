/*
 * The rest of portable profile v1: toolbar buttons, InfoLabel, MultiInput
 * + Token, Tree + StandardTreeItem, and the tolerated layout-data elements.
 */
import { define } from '../registry.js';
import {
  BUTTON_DESIGN, iconName, enabled, valueState, valueStateText,
} from './common.js';

define('sap.m.OverflowToolbarButton', {
  tag: 'ui5-button',
  props: {
    text: { set: (el, v) => { if (v) { el.setAttribute('tooltip', v); el.setAttribute('accessible-name', v); } } },
    icon: { attr: 'icon', convert: iconName },
    type: { attr: 'design', map: BUTTON_DESIGN, mapDefault: 'Default' },
    enabled,
    tooltip: { attr: 'tooltip' },
  },
  events: { press: { on: 'click', params: () => ({}) } },
  read: { text: (el) => el.getAttribute('accessible-name') || '' },
  status: 'basic',
  note: 'icon button with the text as tooltip (the overflow text is the toolbar\'s)',
});

define('sap.tnt.InfoLabel', {
  render(node, api) {
    const el = api.el('ui5-tag', { design: 'Set2', 'color-scheme': '7' });
    const ic = api.el('ui5-icon', { slot: 'icon' });
    const a = node.attrs;
    api.bind(a.text ?? '', (v) => { el.textContent = v ?? ''; if (ic.getAttribute('name')) el.appendChild(ic); });
    if (a.colorScheme !== undefined) api.bind(a.colorScheme, (v) => el.setAttribute('color-scheme', String(Number(v) || 7)));
    if (a.icon !== undefined) api.bind(a.icon, (v) => { if (v) { ic.setAttribute('name', iconName(v)); el.appendChild(ic); } else ic.remove(); });
    if (a.displayOnly !== undefined) api.bind(a.displayOnly, (v) => el.classList.toggle('a2u-infolabel-display', api.toBool(v)));
    return el;
  },
  read: { text: (el) => el.textContent },
});

define('sap.m.Token', {
  render(node, api) {
    const el = api.el('ui5-token');
    const a = node.attrs;
    api.bind(a.key ?? '', (v) => { el.dataset.key = v ?? ''; });
    api.bind(a.text ?? '', (v) => el.setAttribute('text', v ?? ''));
    if (a.selected !== undefined) api.bind(a.selected, (v) => el.toggleAttribute('selected', api.toBool(v)));
    return el;
  },
  read: { key: (el) => el.dataset.key, text: (el) => el.getAttribute('text') || '' },
  status: 'basic',
});

define('sap.m.MultiInput', {
  render(node, api) {
    const el = api.el('ui5-multi-input');
    const a = node.attrs;
    api.renderer.applyAttributes(el, this, node, api);
    const groups = api.renderer.groups(node, { defaultAggregation: 'suggestionItems' });
    if (groups.has('tokens') || a.tokens !== undefined) {
      api.aggregation(node, 'tokens', (kids) => kids.forEach((k) => { k.setAttribute('slot', 'tokens'); el.appendChild(k); }), { groups });
    }
    if (groups.has('suggestionItems') || a.suggestionItems !== undefined) {
      el.setAttribute('show-suggestions', '');
      api.aggregation(node, 'suggestionItems', (kids) => kids.forEach((k) => el.appendChild(k)), { groups, c: { ...api.ctx, itemKind: 'suggestion' } });
    }
    if (api.toBool(api.evaluate(a.showValueHelp ?? 'false'))) el.setAttribute('show-value-help-icon', '');
    return el;
  },
  props: {
    value: { prop: 'value', convert: (v) => (v ?? ''), twoWay: { event: 'change', live: 'input', read: (el) => el.value } },
    placeholder: { attr: 'placeholder' },
    enabled,
    editable: { attr: 'readonly', bool: true, invert: true },
    valueState,
    valueStateText,
    width: { style: 'width' },
    showValueHelp: 'ignore',
    showSuggestion: 'ignore',
  },
  events: {
    change: { on: 'change', params: (ev, el) => ({ value: el.value }) },
    valueHelpRequest: { on: 'value-help-trigger', params: () => ({ fromSuggestions: false }) },
    tokenUpdate: { on: 'token-delete', params: (ev) => ({ type: 'removed', removedTokens: (ev.detail && ev.detail.tokens) || [], addedTokens: [] }) },
    liveChange: { on: 'input', params: (ev, el) => ({ value: el.value, newValue: el.value }) },
    submit: { on: 'keydown', filter: (ev) => ev.key === 'Enter', params: (ev, el) => ({ value: el.value }) },
  },
  aggregations: { tokens: 'ignore', suggestionItems: 'ignore' },
  read: { value: (el) => el.value },
  status: 'basic',
  note: 'tokens are shown; a token delete fires tokenUpdate but is not written back into the bound token table (UI5 needs z2ui5.cc.MultiInputExt for that too)',
});

/*
 * sap.m.Tree: the JSONModel tree binding - every array-valued property of
 * a node holds its children - rendered as nested ui5-tree-items from the
 * one item template.
 */
define('sap.m.Tree', {
  render(node, api) {
    const el = api.el('ui5-tree', { class: 'a2u-tree' });
    const a = node.attrs;
    const groups = api.renderer.groups(node, { defaultAggregation: 'items' });
    if (a.headerText !== undefined) api.bind(a.headerText, (v) => (v ? el.setAttribute('header-text', v) : el.removeAttribute('header-text')));
    if (a.mode !== undefined) api.bind(a.mode, (v) => el.setAttribute('selection-mode', { None: 'None', SingleSelect: 'Single', SingleSelectLeft: 'SingleStart', SingleSelectMaster: 'Single', MultiSelect: 'Multiple', Delete: 'Delete' }[v] || 'None'));
    if (groups.has('headerToolbar')) api.aggregation(node, 'headerToolbar', (k) => k.forEach((x) => { x.setAttribute('slot', 'header'); el.appendChild(x); }), { groups });
    const tpl = (groups.get('items') || [])[0];
    const raw = a.items;
    const scopeHolder = { scope: null };
    const build = () => {
      if (scopeHolder.scope) scopeHolder.scope.dispose();
      scopeHolder.scope = api.ctx.scope.child();
      for (const old of [...el.querySelectorAll(':scope > ui5-tree-item')]) old.remove();
      if (!tpl) return;
      if (raw === undefined) {
        for (const ch of groups.get('items')) { const x = api.child(ch); if (x) el.appendChild(x); }
        return;
      }
      const m = /\{\s*(?:path\s*:\s*['"])?([^'",}]+)/.exec(raw);
      const path = m ? m[1].trim() : '';
      const model = api.ctx.models[''];
      const abs = path.startsWith('/') ? path : `${api.ctx.path}/${path}`;
      const renderLevel = (base, parent) => {
        const data = model.get(base);
        const entries = Array.isArray(data) ? data.map((v, i) => [i, v]) : (data && typeof data === 'object' ? Object.entries(data) : []);
        for (const [k, v] of entries) {
          if (!v || typeof v !== 'object') continue;
          const p = `${base}/${k}`;
          const item = api.child(tpl, { ...api.ctx, path: p, scope: scopeHolder.scope, inTemplate: true });
          if (!item) continue;
          parent.appendChild(item);
          for (const [ck, cv] of Object.entries(v)) if (Array.isArray(cv) && cv.length) renderLevel(`${p}/${ck}`, item);
        }
      };
      renderLevel(abs, el);
    };
    build();
    if (raw !== undefined) api.ctx.scope.add(api.ctx.models[''].subscribe(() => {
      const sig = JSON.stringify(api.ctx.models[''].get((/\{\s*(?:path\s*:\s*['"])?([^'",}]+)/.exec(raw) || [])[1] || '/')).length;
      if (sig !== scopeHolder.sig) { scopeHolder.sig = sig; build(); }
    }));
    if (a.toggleOpenState) api.wire(el, 'toggleOpenState', { on: 'item-toggle', params: (ev) => ({ itemContext: null, expanded: ev.detail && ev.detail.item ? !ev.detail.item.expanded : false }) });
    if (a.itemPress) api.wire(el, 'itemPress', { on: 'item-click', params: (ev) => ({ listItem: ev.detail && ev.detail.item }) });
    if (a.selectionChange) api.wire(el, 'selectionChange', { on: 'selection-change', params: (ev) => ({ listItem: ev.detail && ev.detail.selectedItems && ev.detail.selectedItems[0] }) });
    return el;
  },
  defaultAggregation: 'items',
  status: 'basic',
  note: 'nested array binding, headerText, mode, headerToolbar, toggleOpenState/itemPress/selectionChange',
});

define('sap.m.StandardTreeItem', {
  render(node, api) {
    const el = api.el('ui5-tree-item');
    const a = node.attrs;
    api.bind(a.title ?? '', (v) => el.setAttribute('text', v ?? ''));
    if (a.icon !== undefined) api.bind(a.icon, (v) => (v ? el.setAttribute('icon', iconName(v)) : el.removeAttribute('icon')));
    if (a.selected !== undefined) api.bind(a.selected, (v) => el.toggleAttribute('selected', api.toBool(v)));
    if (a.expanded !== undefined) api.bind(a.expanded, (v) => el.toggleAttribute('expanded', api.toBool(v)));
    if (a.press) api.wire(el, 'press', { on: 'click', params: () => ({}) });
    return el;
  },
  read: { title: (el) => el.getAttribute('text') || '' },
});

/* tolerated: no UI of their own (FlexItemData/GridData are read by the renderer) */
define('sap.ui.core.CustomData', { render: () => null, status: 'full', note: 'tolerated, no UI' });
define('sap.m.OverflowToolbarLayoutData', { render: () => null, status: 'full', note: 'tolerated, no UI' });
define('sap.m.FlexItemData', { render: () => null, status: 'full', note: 'applied to the parent control as CSS flex' });
define('sap.ui.layout.GridData', { render: () => null, status: 'full', note: 'applied to the parent control as grid span' });
