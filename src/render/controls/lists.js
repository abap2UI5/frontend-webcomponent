/*
 * sap.m.Table / Column / ColumnListItem -> ui5-table, and sap.m.List with
 * its items -> ui5-list.
 *
 * Selection follows UI5's model: an item's `selected` is two-way bound to a
 * row field (selected="{SELKZ}"); the table's selection feature
 * (ui5-table-selection-multi / -single) is fed from those bindings and
 * writes them back, so the delta carries the selection exactly as the UI5
 * frontend sends it.
 */
import { define } from '../registry.js';
import { VALUE_STATE, iconName, text } from './common.js';

const META = Symbol.for('abap2ui5-wc.meta');
const SELECT_MODE = {
  MultiSelect: 'multi', SingleSelect: 'single', SingleSelectLeft: 'single', SingleSelectMaster: 'single',
};

/* -------------------------------------------------------------- Table --- */

define('sap.m.Table', {
  wc: '`ui5-table` (+ header row/cells, `ui5-table-selection-multi`/`-single`)',
  render(node, api) {
    const wrap = api.el('div', { class: 'a2u-table' });
    const a = node.attrs;
    const groups = api.renderer.groups(node, { defaultAggregation: 'items' });
    if (groups.has('headerToolbar')) api.aggregation(node, 'headerToolbar', (k) => k.forEach((x) => wrap.appendChild(x)), { groups });
    if (groups.has('infoToolbar')) api.aggregation(node, 'infoToolbar', (k) => k.forEach((x) => wrap.appendChild(x)), { groups });
    if (a.headerText !== undefined) {
      const t = api.el('ui5-title', { level: 'H3', size: 'H5', class: 'a2u-table-header-text' });
      api.bind(a.headerText, (v) => { t.textContent = v ?? ''; t.style.display = v ? '' : 'none'; });
      wrap.appendChild(t);
    }
    const table = api.el('ui5-table', { class: 'a2u-table-control', 'overflow-mode': 'Popin' });
    wrap.appendChild(table);
    const noData = api.el('div', { slot: 'noData', class: 'a2u-nodata' });
    api.bind(a.noDataText ?? 'No data', (v) => { noData.textContent = v ?? ''; });
    table.appendChild(noData);

    // columns -> the header row
    const headerRow = api.el('ui5-table-header-row', { slot: 'headerRow' });
    table.appendChild(headerRow);
    api.aggregation(node, 'columns', (kids) => kids.forEach((k) => headerRow.appendChild(k)), { groups });

    // the selection feature
    const mode = a.mode !== undefined ? api.evaluate(a.mode) : 'None';
    let feature = null;
    if (SELECT_MODE[mode]) {
      feature = api.el(SELECT_MODE[mode] === 'multi' ? 'ui5-table-selection-multi' : 'ui5-table-selection-single', { slot: 'features' });
      table.appendChild(feature);
    } else if (mode === 'Delete') {
      api.report('property', 'sap.m.Table.mode Delete is not rendered');
    }
    const rows = () => [...table.querySelectorAll(':scope > ui5-table-row')];
    const syncSelection = () => {
      if (!feature) return;
      const keys = rows().filter((r) => r.__a2uSelected).map((r) => r.getAttribute('row-key'));
      feature.selected = keys.join(' ');
    };
    table.__a2uSyncSelection = syncSelection;

    api.aggregation(node, 'items', (kids) => {
      kids.forEach((k, i) => {
        if (!k.getAttribute('row-key')) k.setAttribute('row-key', String(i));
        table.appendChild(k);
      });
      syncSelection();
    }, { groups });

    if (feature) {
      feature.addEventListener('change', (ev) => {
        const selected = new Set(String(feature.selected || '').split(' ').filter(Boolean));
        const changed = [];
        for (const r of rows()) {
          const now = selected.has(r.getAttribute('row-key'));
          if (now !== !!r.__a2uSelected) {
            r.__a2uSelected = now;
            changed.push(r);
            if (r.__a2uWriteSelected) r.__a2uWriteSelected(now);
          }
        }
        table.__a2uChanged = changed;
        ev.stopPropagation();
        table.dispatchEvent(new CustomEvent('a2u-selection-change', { detail: { changed } }));
      }, true);
    }
    if (a.selectionChange) {
      api.wire(table, 'selectionChange', {
        on: 'a2u-selection-change',
        params: (ev) => {
          const changed = (ev.detail && ev.detail.changed) || [];
          return { listItem: changed[0] || null, listItems: changed, selected: changed[0] ? !!changed[0].__a2uSelected : false, selectAll: false };
        },
      });
    }
    if (a.itemPress) {
      api.wire(table, 'itemPress', { on: 'row-click', params: (ev) => ({ listItem: ev.detail && ev.detail.row, srcControl: ev.detail && ev.detail.row }) });
    }
    if (a.width !== undefined) api.bind(a.width, (v) => { wrap.style.width = v || ''; });
    return wrap;
  },
  noSize: true,
  defaultAggregation: 'items',
  read: {},
  status: 'basic',
  note: 'columns, items (bound or static), header toolbar, noDataText, MultiSelect/SingleSelect via the selected binding, itemPress, selectionChange; no growing (all rows render), no Delete mode, no grouping',
});

define('sap.m.Column', {
  render(node, api) {
    const el = api.el('ui5-table-header-cell');
    const a = node.attrs;
    if (a.width !== undefined) api.bind(a.width, (v) => (v ? el.setAttribute('width', v) : el.removeAttribute('width')));
    if (a.hAlign !== undefined) api.bind(a.hAlign, (v) => { el.style.justifyContent = { Begin: 'flex-start', Left: 'flex-start', Center: 'center', End: 'flex-end', Right: 'flex-end' }[v] || ''; el.style.textAlign = { Center: 'center', End: 'right', Right: 'right' }[v] || ''; });
    if (a.minScreenWidth !== undefined) api.bind(a.minScreenWidth, (v) => { if (v) el.setAttribute('min-width', /^\d+$/.test(v) ? `${v}px` : ({ Phone: '240px', Tablet: '600px', Desktop: '1024px', Small: '240px', Medium: '600px', Large: '1024px' }[v] || '')); });
    const groups = api.renderer.groups(node, { defaultAggregation: 'header' });
    api.aggregation(node, 'header', (k) => k.forEach((x) => el.appendChild(x)), { groups });
    return el;
  },
  defaultAggregation: 'header',
  status: 'basic',
  note: 'header, width, hAlign, minScreenWidth; no demandPopin/footer',
});

const ROW_INTERACTIVE = new Set(['Active', 'Navigation', 'Detail', 'DetailAndActive']);

/* the `selected` of an item: two-way bound, written by the selection feature */
function itemSelection(el, node, api, onChange) {
  const raw = node.attrs.selected;
  if (raw === undefined) return;
  const b = api.bind(raw, (v) => {
    el.__a2uSelected = api.toBool(v);
    if (onChange) onChange();
  });
  el.__a2uWriteSelected = (now) => {
    const t = b.target && b.target(api.ctx);
    if (t) {
      b.reset();
      t.model.set(t.path, now, { notify: false });
    }
  };
}

define('sap.m.ColumnListItem', {
  render(node, api) {
    const el = api.el('ui5-table-row');
    const a = node.attrs;
    if (api.ctx.rowKey !== undefined) el.setAttribute('row-key', String(api.ctx.rowKey));
    api.bind(a.type ?? 'Inactive', (v) => {
      el.toggleAttribute('interactive', ROW_INTERACTIVE.has(v));
      el.toggleAttribute('navigated', false);
    });
    if (a.highlight !== undefined) api.bind(a.highlight, (v) => { el.dataset.highlight = VALUE_STATE[v] || ''; });
    itemSelection(el, node, api, () => {
      const t = el.parentElement;
      if (t && t.__a2uSyncSelection) t.__a2uSyncSelection();
    });
    if (a.press) api.wire(el, 'press', { on: 'click', params: () => ({}) });
    const groups = api.renderer.groups(node, { defaultAggregation: 'cells' });
    api.aggregation(node, 'cells', (kids) => kids.forEach((k) => {
      const cell = api.el('ui5-table-cell');
      cell.appendChild(k);
      el.appendChild(cell);
    }), { groups });
    return el;
  },
  defaultAggregation: 'cells',
  read: { selected: (el) => !!el.__a2uSelected },
  status: 'basic',
  note: 'cells, type (interactive rows), selected, press; highlight not shown',
});

/* --------------------------------------------------------------- List --- */

const LIST_MODE = {
  None: 'None', SingleSelect: 'Single', SingleSelectLeft: 'SingleStart', SingleSelectMaster: 'Single', MultiSelect: 'Multiple', Delete: 'Delete',
};

define('sap.m.List', {
  render(node, api) {
    const el = api.el('ui5-list', { class: 'a2u-list' });
    const a = node.attrs;
    const groups = api.renderer.groups(node, { defaultAggregation: 'items' });
    if (a.headerText !== undefined) api.bind(a.headerText, (v) => (v ? el.setAttribute('header-text', v) : el.removeAttribute('header-text')));
    if (a.footerText !== undefined) api.bind(a.footerText, (v) => (v ? el.setAttribute('footer-text', v) : el.removeAttribute('footer-text')));
    api.bind(a.noDataText ?? 'No data', (v) => el.setAttribute('no-data-text', v ?? ''));
    if (a.mode !== undefined) api.bind(a.mode, (v) => el.setAttribute('selection-mode', LIST_MODE[v] || 'None'));
    if (a.inset !== undefined) api.bind(a.inset, (v) => el.classList.toggle('a2u-inset', api.toBool(v)));
    if (groups.has('headerToolbar')) api.aggregation(node, 'headerToolbar', (k) => k.forEach((x) => { x.setAttribute('slot', 'header'); el.appendChild(x); }), { groups });
    api.aggregation(node, 'items', (kids) => kids.forEach((k) => el.appendChild(k)), { groups });
    // UI5 selects a SingleSelect(Master) item on any click; a web-component
    // item of type Detail/Inactive does not react to a click at all - so the
    // selection is made here and announced the way the list would
    el.addEventListener('click', (ev) => {
      if (el.getAttribute('selection-mode') !== 'Single') return;
      const path = ev.composedPath();
      if (path.some((n) => n && n.getAttribute && n.getAttribute('part') === 'detail-button')) return;
      const item = path.find((n) => n && n.parentElement === el && n.hasAttribute && n.hasAttribute('data-ui5-control'));
      if (!item || ['Active', 'Navigation'].includes(item.getAttribute('type')) || item.selected) return;
      const prev = [...el.children].filter((x) => x.selected);
      for (const x of prev) x.selected = false;
      item.selected = true;
      el.dispatchEvent(new CustomEvent('selection-change', { bubbles: true, detail: { selectedItems: [item], previouslySelectedItems: prev, a2uEmulated: true } }));
    }, true);
    el.addEventListener('selection-change', (ev) => {
      const sel = new Set((ev.detail && ev.detail.selectedItems) || []);
      for (const item of el.querySelectorAll(':scope > [data-ui5-control]')) {
        const now = sel.has(item);
        if (now !== !!item.__a2uSelected) {
          item.__a2uSelected = now;
          if (item.__a2uWriteSelected) item.__a2uWriteSelected(now);
        }
      }
    }, true);
    if (a.itemPress) api.wire(el, 'itemPress', { on: 'item-click', params: (ev) => ({ listItem: ev.detail && ev.detail.item, srcControl: ev.detail && ev.detail.item }) });
    if (a.selectionChange) {
      api.wire(el, 'selectionChange', {
        on: 'selection-change',
        params: (ev) => {
          const sel = (ev.detail && ev.detail.selectedItems) || [];
          const prev = (ev.detail && ev.detail.previouslySelectedItems) || [];
          const changed = sel.filter((x) => !prev.includes(x)).concat(prev.filter((x) => !sel.includes(x)));
          return { listItem: changed[0] || sel[0] || null, listItems: changed, selected: changed[0] ? sel.includes(changed[0]) : false };
        },
      });
    }
    if (a.delete) api.wire(el, 'delete', { on: 'item-delete', params: (ev) => ({ listItem: ev.detail && ev.detail.item }) });
    return el;
  },
  defaultAggregation: 'items',
  status: 'basic',
  note: 'items (bound or static), headerText, mode, itemPress, selectionChange, delete; no growing, no grouping',
});

const LI_TYPE = { Inactive: 'Inactive', Active: 'Active', Navigation: 'Navigation', Detail: 'Detail', DetailAndActive: 'Detail' };

function listItem(node, api, el) {
  const a = node.attrs;
  api.bind(a.type ?? 'Inactive', (v) => el.setAttribute('type', LI_TYPE[v] || 'Inactive'));
  if (a.highlight !== undefined) api.bind(a.highlight, (v) => el.setAttribute('highlight', VALUE_STATE[v] || 'None'));
  if (a.unread !== undefined) api.bind(a.unread, (v) => el.classList.toggle('a2u-unread', api.toBool(v)));
  itemSelection(el, node, api, () => { el.selected = !!el.__a2uSelected; });
  if (a.press) api.wire(el, 'press', { on: 'click', params: () => ({}) });
  if (a.detailPress) api.wire(el, 'detailPress', { on: 'detail-click', params: () => ({}) });
}

define('sap.m.StandardListItem', {
  render(node, api) {
    const el = api.el('ui5-li');
    const a = node.attrs;
    api.bind(a.title ?? '', (v) => { el.textContent = v ?? ''; });
    if (a.description !== undefined) api.bind(a.description, (v) => (v ? el.setAttribute('description', v) : el.removeAttribute('description')));
    if (a.icon !== undefined) api.bind(a.icon, (v) => (v ? el.setAttribute('icon', iconName(v)) : el.removeAttribute('icon')));
    if (a.info !== undefined) api.bind(a.info, (v) => (v ? el.setAttribute('additional-text', v) : el.removeAttribute('additional-text')));
    if (a.infoState !== undefined) api.bind(a.infoState, (v) => el.setAttribute('additional-text-state', VALUE_STATE[v] || 'None'));
    if (a.wrapping !== undefined) api.bind(a.wrapping, (v) => el.setAttribute('wrapping-type', api.toBool(v) ? 'Normal' : 'None'));
    listItem(node, api, el);
    return el;
  },
  read: { title: (el) => el.textContent, description: (el) => el.getAttribute('description') || '', selected: (el) => !!el.__a2uSelected },
  status: 'basic',
  note: 'title, description, icon, info, infoState, highlight, type, selected; no counter/avatar',
});

define('sap.m.DisplayListItem', {
  render(node, api) {
    const el = api.el('ui5-li');
    api.bind(node.attrs.label ?? '', (v) => { el.textContent = v ?? ''; });
    api.bind(node.attrs.value ?? '', (v) => (v ? el.setAttribute('additional-text', v) : el.removeAttribute('additional-text')));
    listItem(node, api, el);
    return el;
  },
  read: { label: (el) => el.textContent },
});

define('sap.m.ObjectListItem', {
  render(node, api) {
    const el = api.el('ui5-li');
    const a = node.attrs;
    api.bind(a.title ?? '', (v) => { el.textContent = v ?? ''; });
    if (a.intro !== undefined) api.bind(a.intro, (v) => (v ? el.setAttribute('description', v) : el.removeAttribute('description')));
    const num = a.number !== undefined ? a.number : null;
    if (num !== null) api.bind(`${num}${a.numberUnit ? ` ${a.numberUnit}` : ''}`, (v) => el.setAttribute('additional-text', v ?? ''));
    if (a.numberState !== undefined) api.bind(a.numberState, (v) => el.setAttribute('additional-text-state', VALUE_STATE[v] || 'None'));
    if (a.icon !== undefined) api.bind(a.icon, (v) => (v ? el.setAttribute('icon', iconName(v)) : el.removeAttribute('icon')));
    listItem(node, api, el);
    return el;
  },
  status: 'basic',
  note: 'title, intro, number, icon; attributes and statuses are not shown',
});

define('sap.m.CustomListItem', {
  render(node, api) {
    const el = api.el('ui5-li-custom');
    listItem(node, api, el);
    const groups = api.renderer.groups(node, { defaultAggregation: 'content' });
    api.aggregation(node, 'content', (k) => k.forEach((x) => el.appendChild(x)), { groups });
    return el;
  },
  defaultAggregation: 'content',
});

define('sap.m.ActionListItem', {
  render(node, api) {
    const el = api.el('ui5-li', { type: 'Active', class: 'a2u-action-item' });
    api.bind(node.attrs.text ?? '', (v) => { el.textContent = v ?? ''; });
    if (node.attrs.press) api.wire(el, 'press', { on: 'click', params: () => ({}) });
    return el;
  },
});

define('sap.m.GroupHeaderListItem', {
  render(node, api) {
    const el = api.el('ui5-li', { type: 'Inactive', class: 'a2u-group-header' });
    api.bind(node.attrs.title ?? '', (v) => { el.textContent = v ?? ''; });
    return el;
  },
  status: 'basic',
});

export { META, text };
