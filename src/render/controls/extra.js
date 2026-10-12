/*
 * The rest of portable profile v1: toolbar buttons, InfoLabel, MultiInput
 * + Token, Tree + StandardTreeItem, and the tolerated layout-data elements.
 */
import { define } from '../registry.js';
import { compileAggregation, aggregationRows } from '../../bindings/binding.js';
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
  note: 'text, key, selected',
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
 * one item template. The items binding is read like any aggregation
 * binding (sorter, length, startIndex apply to the top level); the tree is
 * rebuilt when its STRUCTURE changes - the paths of its nodes, in order -
 * while a changed title or icon refreshes in place through the item's own
 * bindings.
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
    const agg = a.items !== undefined ? compileAggregation(a.items) : null;
    if (agg && agg.unsupported) api.report('binding', `sap.m.Tree.items: ${agg.unsupported}`);
    for (const issue of (agg && agg.issues) || []) api.report(issue.kind, issue.detail);
    if (!agg || agg.unsupported) {
      // static items
      api.aggregation(node, 'items', (kids) => kids.forEach((k) => el.appendChild(k)), { groups });
    } else if (tpl) {
      let scope = null;
      let signature = null;
      // the nodes of a level: [path, value] of every object entry, children first-level only
      const childrenOf = (value) => Object.entries(value).filter(([, v]) => Array.isArray(v) && v.length);
      const structure = (rows, model) => {
        const out = [];
        const walk = (path, value) => {
          if (!value || typeof value !== 'object') return;
          out.push(path);
          for (const [k, arr] of childrenOf(value)) arr.forEach((v, i) => walk(`${path}/${k}/${i}`, v));
        };
        for (const row of rows) walk(row.path, model.get(row.path));
        return out;
      };
      const build = () => {
        const { model, rows } = aggregationRows(agg, api.ctx);
        if (!model) return;
        const sig = structure(rows, model).join('|');
        if (sig === signature) return;
        signature = sig;
        if (scope) scope.dispose();
        scope = api.ctx.scope.child();
        for (const old of [...el.querySelectorAll(':scope > ui5-tree-item')]) old.remove();
        const renderNode = (path, parent) => {
          const value = model.get(path);
          if (!value || typeof value !== 'object') return;
          const item = api.child(tpl, { ...api.ctx, path, scope, inTemplate: true });
          if (!item) return;
          parent.appendChild(item);
          for (const [k, arr] of childrenOf(value)) arr.forEach((v, i) => renderNode(`${path}/${k}/${i}`, item));
        };
        for (const row of rows) renderNode(row.path, el);
      };
      build();
      for (const m of Object.values(api.ctx.models)) if (m && m.subscribe) api.ctx.scope.add(m.subscribe(build));
    }
    if (a.toggleOpenState) api.wire(el, 'toggleOpenState', { on: 'item-toggle', params: (ev) => ({ itemContext: null, expanded: ev.detail && ev.detail.item ? !ev.detail.item.expanded : false }) });
    if (a.itemPress) api.wire(el, 'itemPress', { on: 'item-click', params: (ev) => ({ listItem: ev.detail && ev.detail.item }) });
    if (a.selectionChange) api.wire(el, 'selectionChange', { on: 'selection-change', params: (ev) => ({ listItem: ev.detail && ev.detail.selectedItems && ev.detail.selectedItems[0] }) });
    return el;
  },
  defaultAggregation: 'items',
  status: 'basic',
  note: 'nested array binding (sorter, length, startIndex at the top level), headerText, mode, headerToolbar, toggleOpenState/itemPress/selectionChange',
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
