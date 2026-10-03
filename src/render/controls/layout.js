/*
 * Containers and layouts: views, pages, boxes, forms, toolbars, tabs, panels.
 */
import { define } from '../registry.js';
import { FLEX_ALIGN } from '../renderer.js';
import { iconName, text } from './common.js';

const JUSTIFY = {
  Start: 'flex-start', End: 'flex-end', Center: 'center', SpaceBetween: 'space-between', SpaceAround: 'space-around', SpaceEvenly: 'space-evenly', Inherit: '',
};
const WRAP = { NoWrap: 'nowrap', Wrap: 'wrap', WrapReverse: 'wrap-reverse' };

/** Render every control of every aggregation into `target` (or per-aggregation targets). */
function allInto(node, api, target, mapper = { defaultAggregation: 'content' }, targets = {}) {
  const groups = api.renderer.groups(node, mapper);
  const names = new Set([...groups.keys(), ...Object.keys(targets).filter((n) => node.attrs[n] !== undefined)]);
  for (const name of names) {
    const t = targets[name] === undefined ? target : targets[name];
    if (t === null) continue;
    api.aggregation(node, name, (kids) => kids.forEach((k) => t.appendChild(k)), { groups });
  }
}

const passthrough = (cls) => ({
  render(node, api) {
    const el = api.el('div', { class: cls });
    allInto(node, api, el, this);
    return el;
  },
});

define('sap.ui.core.mvc.View', { ...passthrough('a2u-view'), defaultAggregation: 'content' });
define('sap.ui.core.mvc.XMLView', { ...passthrough('a2u-view'), defaultAggregation: 'content' });
define('sap.ui.core.FragmentDefinition', { ...passthrough('a2u-fragment'), defaultAggregation: 'content' });
define('sap.m.Shell', { ...passthrough('a2u-shell'), defaultAggregation: 'app' });
define('sap.m.App', { ...passthrough('a2u-app'), defaultAggregation: 'pages' });

define('sap.m.NavContainer', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-navcontainer' });
    const groups = api.renderer.groups(node, { defaultAggregation: 'pages' });
    const initial = node.attrs.initialPage ? api.evaluate(node.attrs.initialPage) : null;
    api.aggregation(node, 'pages', (kids) => {
      kids.forEach((k, i) => {
        const id = k.getAttribute('data-ui5-id');
        const show = initial ? id === initial : i === 0;
        if (!show) k.style.display = 'none';
        el.appendChild(k);
      });
    }, { groups });
    return el;
  },
  status: 'basic',
  note: 'shows the initial (or first) page; to() by CONTROL_BY_ID is not supported',
});

/*
 * sap.m.Page -> ui5-page with a ui5-bar header (nav button, title,
 * headerContent) and a ui5-bar footer.
 */
define('sap.m.Page', {
  render(node, api) {
    const el = api.el('ui5-page', { 'background-design': 'Solid', class: 'a2u-page' });
    const a = node.attrs;
    const groups = api.renderer.groups(node, this);
    const showHeader = a.showHeader === undefined || api.toBool(api.evaluate(a.showHeader));
    const header = api.el('ui5-bar', { slot: 'header', design: 'Header', class: 'a2u-page-header' });
    if (groups.has('customHeader')) {
      api.aggregation(node, 'customHeader', (kids) => kids.forEach((k) => { k.setAttribute('slot', 'header'); el.appendChild(k); }), { groups });
    } else if (showHeader) {
      const nav = api.el('ui5-button', { icon: 'nav-back', design: 'Transparent', slot: 'startContent', class: 'a2u-nav-back', tooltip: 'Back' });
      header.appendChild(nav);
      if (a.showNavButton !== undefined) api.bind(a.showNavButton, (v) => { nav.style.display = api.toBool(v) ? '' : 'none'; });
      else nav.style.display = 'none';
      if (a.navButtonPress) api.wire(nav, 'navButtonPress', { on: 'click', params: () => ({}) });
      const title = api.el('ui5-title', { level: 'H2', size: 'H5', class: 'a2u-page-title' });
      header.appendChild(title);
      api.bind(a.title ?? '', (v) => { title.textContent = v ?? ''; });
      if (a.titleLevel !== undefined) api.bind(a.titleLevel, (v) => title.setAttribute('level', /^H[1-6]$/.test(v) ? v : 'H2'));
      if (groups.has('headerContent')) {
        api.aggregation(node, 'headerContent', (kids) => kids.forEach((k) => { k.setAttribute('slot', 'endContent'); header.appendChild(k); }), { groups });
      }
      el.appendChild(header);
    }
    const content = api.el('div', { class: 'a2u-page-content' });
    if (groups.has('subHeader')) {
      const sub = api.el('div', { class: 'a2u-page-subheader' });
      api.aggregation(node, 'subHeader', (kids) => kids.forEach((k) => sub.appendChild(k)), { groups });
      content.appendChild(sub);
    }
    api.aggregation(node, 'content', (kids) => kids.forEach((k) => content.appendChild(k)), { groups });
    el.appendChild(content);
    if (groups.has('footer')) {
      api.aggregation(node, 'footer', (kids) => kids.forEach((k) => {
        k.setAttribute('slot', 'footer');
        k.classList.add('a2u-page-footer');
        el.appendChild(k);
      }), { groups });
    } else {
      el.setAttribute('hide-footer', '');
    }
    if (a.floatingFooter !== undefined && api.toBool(api.evaluate(a.floatingFooter))) el.removeAttribute('fixed-footer');
    else el.setAttribute('fixed-footer', '');
    if (a.backgroundDesign !== undefined) api.bind(a.backgroundDesign, (v) => el.setAttribute('background-design', { Standard: 'Solid', Solid: 'Solid', List: 'List', Transparent: 'Transparent' }[v] || 'Solid'));
    if (a.enableScrolling !== undefined && !api.toBool(api.evaluate(a.enableScrolling))) el.setAttribute('no-scrolling', '');
    if (a.titleAlignment) { /* the bar centres its middle content */ }
    return el;
  },
  defaultAggregation: 'content',
  read: { title: (el) => (el.querySelector('.a2u-page-title') || {}).textContent || '' },
});

function flexBox(direction) {
  return {
    render(node, api) {
      const el = api.el('div', { class: 'a2u-flexbox' });
      const a = node.attrs;
      el.style.display = 'flex';
      el.dataset.a2uDisplay = 'flex';
      el.style.flexDirection = direction;
      if (a.direction !== undefined) api.bind(a.direction, (v) => { el.style.flexDirection = { Row: 'row', Column: 'column', RowReverse: 'row-reverse', ColumnReverse: 'column-reverse' }[v] || direction; });
      if (a.alignItems !== undefined) api.bind(a.alignItems, (v) => { el.style.alignItems = FLEX_ALIGN[v] || ''; });
      if (a.justifyContent !== undefined) api.bind(a.justifyContent, (v) => { el.style.justifyContent = JUSTIFY[v] || ''; });
      if (a.wrap !== undefined) api.bind(a.wrap, (v) => { el.style.flexWrap = WRAP[v] || ''; });
      if (a.alignContent !== undefined) api.bind(a.alignContent, (v) => { el.style.alignContent = JUSTIFY[v] || FLEX_ALIGN[v] || ''; });
      if (a.fitContainer !== undefined) api.bind(a.fitContainer, (v) => { if (api.toBool(v)) el.style.height = '100%'; });
      if (a.displayInline !== undefined) api.bind(a.displayInline, (v) => { if (api.toBool(v)) { el.style.display = 'inline-flex'; el.dataset.a2uDisplay = 'inline-flex'; } });
      if (a.backgroundDesign !== undefined) api.bind(a.backgroundDesign, (v) => el.classList.toggle('a2u-bg-solid', v === 'Solid'));
      allInto(node, api, el, { defaultAggregation: 'items' });
      return el;
    },
    defaultAggregation: 'items',
    note: 'CSS flexbox: direction, alignItems, justifyContent, wrap, fitContainer; FlexItemData grow/shrink/base',
  };
}
define('sap.m.VBox', flexBox('column'));
define('sap.m.HBox', flexBox('row'));
define('sap.m.FlexBox', flexBox('row'));

define('sap.m.ScrollContainer', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-scroll' });
    const a = node.attrs;
    api.bind(a.vertical ?? 'false', (v) => { el.style.overflowY = api.toBool(v) ? 'auto' : 'hidden'; });
    api.bind(a.horizontal ?? 'true', (v) => { el.style.overflowX = api.toBool(v) ? 'auto' : 'hidden'; });
    allInto(node, api, el);
    return el;
  },
});

define('sap.ui.layout.VerticalLayout', { ...passthrough('a2u-vlayout'), status: 'basic' });
define('sap.ui.layout.HorizontalLayout', { ...passthrough('a2u-hlayout'), status: 'basic' });

/* sap.ui.layout.Grid: a 12-column CSS grid; spans from defaultSpan / GridData. */
function spanOf(spec, size) {
  const m = new RegExp(`${size}(\\d+)`).exec(String(spec || ''));
  return m ? Number(m[1]) : null;
}
define('sap.ui.layout.Grid', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-grid' });
    const a = node.attrs;
    const def = api.evaluate(a.defaultSpan ?? 'XL3 L3 M6 S12');
    if (a.hSpacing !== undefined) api.bind(a.hSpacing, (v) => { el.style.columnGap = `${Number(v) || 0}rem`; });
    if (a.vSpacing !== undefined) api.bind(a.vSpacing, (v) => { el.style.rowGap = `${Number(v) || 0}rem`; });
    const groups = api.renderer.groups(node, { defaultAggregation: 'content' });
    api.aggregation(node, 'content', (kids) => {
      for (const k of kids) {
        const spec = k.dataset.a2uSpan || def;
        const l = spanOf(spec, 'L') ?? spanOf(def, 'L') ?? 3;
        k.style.setProperty('--a2u-span-xl', spanOf(spec, 'XL') ?? l);
        k.style.setProperty('--a2u-span-l', l);
        k.style.setProperty('--a2u-span-m', spanOf(spec, 'M') ?? spanOf(def, 'M') ?? 6);
        k.style.setProperty('--a2u-span-s', spanOf(spec, 'S') ?? spanOf(def, 'S') ?? 12);
        k.classList.add('a2u-grid-cell');
        el.appendChild(k);
      }
    }, { groups });
    return el;
  },
  defaultAggregation: 'content',
  status: 'basic',
  note: 'defaultSpan and GridData span (XL/L/M/S); no indent',
});

/*
 * SimpleForm: a two-column CSS grid. A Label starts a row, the controls
 * after it share the field cell; a Title / core:Title / Toolbar starts a
 * group. The responsive layouts and column counts are not modelled.
 */
define('sap.ui.layout.form.SimpleForm', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-form' });
    const a = node.attrs;
    const groups = api.renderer.groups(node, { defaultAggregation: 'content' });
    const head = api.el('div', { class: 'a2u-form-header' });
    if (a.title !== undefined) {
      const t = api.el('ui5-title', { level: 'H3', size: 'H5' });
      api.bind(a.title, (v) => { t.textContent = v ?? ''; head.style.display = v ? '' : 'none'; });
      head.appendChild(t);
    }
    if (groups.has('title')) api.aggregation(node, 'title', (k) => k.forEach((x) => head.appendChild(x)), { groups });
    if (groups.has('toolbar')) api.aggregation(node, 'toolbar', (k) => k.forEach((x) => head.appendChild(x)), { groups });
    if (head.childNodes.length) el.appendChild(head);
    const grid = api.el('div', { class: 'a2u-form-grid' });
    el.appendChild(grid);
    api.bind(a.editable ?? 'false', (v) => el.classList.toggle('a2u-form-editable', api.toBool(v)));
    api.aggregation(node, 'content', (kids) => {
      let fields = null;
      for (const k of kids) {
        const ctl = k.getAttribute('data-ui5-control') || '';
        if (/\.(Title|Toolbar|OverflowToolbar)$/.test(ctl)) {
          k.classList.add('a2u-form-group-title');
          grid.appendChild(k);
          fields = null;
        } else if (/\.Label$/.test(ctl)) {
          k.classList.add('a2u-form-label');
          grid.appendChild(k);
          fields = api.el('div', { class: 'a2u-form-fields' });
          grid.appendChild(fields);
        } else {
          if (!fields) {
            grid.appendChild(api.el('div', { class: 'a2u-form-label' }));
            fields = api.el('div', { class: 'a2u-form-fields' });
            grid.appendChild(fields);
          }
          fields.appendChild(k);
        }
      }
    }, { groups });
    return el;
  },
  defaultAggregation: 'content',
  status: 'basic',
  note: 'label/field grid with group titles; layout, columns and breakpoints are not modelled',
});

/* sap.ui.layout.form.Form: containers -> groups, elements -> label + fields. */
define('sap.ui.layout.form.Form', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-form' });
    const a = node.attrs;
    if (a.title !== undefined) {
      const t = api.el('ui5-title', { level: 'H3', size: 'H5', class: 'a2u-form-header' });
      api.bind(a.title, (v) => { t.textContent = v ?? ''; });
      el.appendChild(t);
    }
    const grid = api.el('div', { class: 'a2u-form-grid' });
    el.appendChild(grid);
    const groups = api.renderer.groups(node, { defaultAggregation: 'formContainers' });
    if (groups.has('toolbar')) api.aggregation(node, 'toolbar', (k) => k.forEach((x) => el.insertBefore(x, grid)), { groups });
    api.aggregation(node, 'formContainers', (kids) => kids.forEach((k) => grid.appendChild(k)), { groups });
    return el;
  },
  defaultAggregation: 'formContainers',
  status: 'basic',
});
define('sap.ui.layout.form.FormContainer', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-form-container' });
    if (node.attrs.title !== undefined) {
      const t = api.el('ui5-title', { level: 'H4', size: 'H6', class: 'a2u-form-group-title' });
      api.bind(node.attrs.title, (v) => { t.textContent = v ?? ''; });
      el.appendChild(t);
    }
    allInto(node, api, el, { defaultAggregation: 'formElements' });
    return el;
  },
  status: 'basic',
});
define('sap.ui.layout.form.FormElement', {
  render(node, api) {
    const el = api.el('div', { class: 'a2u-form-element' });
    const label = api.el('ui5-label', { class: 'a2u-form-label', 'show-colon': true });
    if (node.attrs.label !== undefined) api.bind(node.attrs.label, (v) => { label.textContent = v ?? ''; });
    el.appendChild(label);
    const fields = api.el('div', { class: 'a2u-form-fields' });
    el.appendChild(fields);
    const groups = api.renderer.groups(node, { defaultAggregation: 'fields' });
    if (groups.has('label')) api.aggregation(node, 'label', (k) => { label.replaceWith(...k); k.forEach((x) => x.classList.add('a2u-form-label')); }, { groups });
    api.aggregation(node, 'fields', (k) => k.forEach((x) => fields.appendChild(x)), { groups });
    return el;
  },
  status: 'basic',
});

/*
 * Toolbar / OverflowToolbar -> ui5-toolbar. Buttons, selects, separators
 * and spacers become the toolbar's own items; every other control rides in
 * a ui5-toolbar-item. Overflow is the web component's.
 */
/*
 * A Button inside a toolbar becomes a ui5-toolbar-button (the toolbar's own
 * item, which overflows properly). The rendered ui5-button stays the
 * control of record - its bindings keep writing to it - and is mirrored:
 * text, icon, design, disabled, tooltip, hidden; a click on the toolbar
 * button is re-dispatched to it, so its wire fires with its own context.
 */
function toolbarButton(btn, api) {
  const tb = api.el('ui5-toolbar-button');
  tb[Symbol.for('abap2ui5-wc.meta')] = btn[Symbol.for('abap2ui5-wc.meta')];
  for (const a of ['data-ui5-control', 'data-ui5-id', 'id', 'class']) if (btn.hasAttribute(a)) tb.setAttribute(a, btn.getAttribute(a));
  btn.removeAttribute('id');
  for (const [id, e] of api.ctx.ids) if (e === btn) api.ctx.ids.set(id, tb);
  const sync = () => {
    tb.setAttribute('text', btn.textContent || '');
    for (const a of ['icon', 'design', 'tooltip']) {
      if (btn.hasAttribute(a)) tb.setAttribute(a, btn.getAttribute(a));
      else tb.removeAttribute(a);
    }
    tb.toggleAttribute('disabled', btn.hasAttribute('disabled'));
    tb.hidden = btn.hidden;
    tb.style.display = btn.hidden ? 'none' : '';
    const ov = btn.getAttribute('data-a2u-overflow');
    if (ov === 'NeverOverflow' || ov === 'AlwaysOverflow') tb.setAttribute('overflow-priority', ov);
  };
  sync();
  new MutationObserver(sync).observe(btn, { attributes: true, childList: true, characterData: true, subtree: true });
  tb.addEventListener('click', (ev) => {
    ev.stopPropagation();
    btn.dispatchEvent(new CustomEvent('click', { bubbles: false }));
  });
  tb.__a2uSource = btn;
  return tb;
}

function toolbar(design) {
  return {
    render(node, api) {
      const el = api.el('ui5-toolbar', { class: 'a2u-toolbar', design });
      const a = node.attrs;
      if (a.design !== undefined) api.bind(a.design, (v) => el.setAttribute('design', v === 'Transparent' || v === 'Info' ? 'Transparent' : 'Solid'));
      if (a.style !== undefined) api.bind(a.style, (v) => el.classList.toggle('a2u-toolbar-clear', v === 'Clear'));
      const groups = api.renderer.groups(node, { defaultAggregation: 'content' });
      api.aggregation(node, 'content', (kids) => {
        for (const k of kids) {
          if (k.hasAttribute('data-a2u-spacer')) {
            el.appendChild(api.el('ui5-toolbar-spacer'));
          } else if (k.hasAttribute('data-a2u-separator')) {
            el.appendChild(api.el('ui5-toolbar-separator'));
          } else if (k.tagName === 'UI5-BUTTON') {
            el.appendChild(toolbarButton(k, api));
          } else {
            const item = api.el('ui5-toolbar-item');
            const ld = k.getAttribute('data-a2u-overflow');
            if (ld === 'NeverOverflow') item.setAttribute('overflow-priority', 'NeverOverflow');
            if (k.hidden) item.style.display = 'none';
            item.appendChild(k);
            // the item follows its control's visibility
            new MutationObserver(() => { item.style.display = k.hidden ? 'none' : ''; }).observe(k, { attributes: true, attributeFilter: ['hidden'] });
            el.appendChild(item);
          }
        }
      }, { groups });
      return el;
    },
    defaultAggregation: 'content',
  };
}
define('sap.m.Toolbar', toolbar('Solid'));
define('sap.m.OverflowToolbar', toolbar('Solid'));

define('sap.m.Bar', {
  render(node, api) {
    const el = api.el('ui5-bar', { design: 'Header' });
    const a = node.attrs;
    if (a.design !== undefined) api.bind(a.design, (v) => el.setAttribute('design', { Header: 'Header', SubHeader: 'Subheader', Footer: 'Footer', FloatingFooter: 'FloatingFooter', Auto: 'Header' }[v] || 'Header'));
    const groups = api.renderer.groups(node, { defaultAggregation: 'contentMiddle' });
    const slots = { contentLeft: 'startContent', contentMiddle: null, contentRight: 'endContent' };
    for (const [agg, slot] of Object.entries(slots)) {
      if (!groups.has(agg)) continue;
      api.aggregation(node, agg, (kids) => kids.forEach((k) => { if (slot) k.setAttribute('slot', slot); el.appendChild(k); }), { groups });
    }
    return el;
  },
});

define('sap.m.Panel', {
  render(node, api) {
    const el = api.el('ui5-panel', { class: 'a2u-panel' });
    const a = node.attrs;
    api.bind(a.headerText ?? '', (v) => (v ? el.setAttribute('header-text', v) : el.removeAttribute('header-text')));
    api.bind(a.expandable ?? 'false', (v) => el.toggleAttribute('fixed', !api.toBool(v)));
    api.prop(el, 'expanded', { set: (e, v) => { e.collapsed = v !== undefined && !api.toBool(v); }, twoWay: { event: 'toggle', read: (e) => !e.collapsed } });
    if (a.expanded === undefined) el.collapsed = false;
    if (a.expandAnimation !== undefined) api.bind(a.expandAnimation, (v) => el.toggleAttribute('no-animation', !api.toBool(v)));
    if (a.backgroundDesign !== undefined) api.bind(a.backgroundDesign, (v) => el.classList.toggle('a2u-panel-transparent', v === 'Transparent'));
    if (a.expand) api.wire(el, 'expand', { on: 'toggle', params: (ev, e) => ({ expand: !e.collapsed }) });
    const groups = api.renderer.groups(node, { defaultAggregation: 'content' });
    if (groups.has('headerToolbar')) api.aggregation(node, 'headerToolbar', (k) => k.forEach((x) => { x.setAttribute('slot', 'header'); el.appendChild(x); }), { groups });
    if (groups.has('infoToolbar')) api.aggregation(node, 'infoToolbar', (k) => k.forEach((x) => el.appendChild(x)), { groups });
    api.aggregation(node, 'content', (k) => k.forEach((x) => el.appendChild(x)), { groups });
    return el;
  },
  defaultAggregation: 'content',
  read: { expanded: (el) => !el.collapsed, headerText: (el) => el.getAttribute('header-text') || '' },
});

/* IconTabBar -> ui5-tabcontainer; IconTabFilter -> ui5-tab (content inside). */
const TAB_DESIGN = { Default: 'Default', Positive: 'Positive', Negative: 'Negative', Critical: 'Critical', Neutral: 'Neutral', Contrast: 'Default' };
define('sap.m.IconTabBar', {
  render(node, api) {
    const wrap = api.el('div', { class: 'a2u-icontabbar' });
    const el = api.el('ui5-tabcontainer', { 'content-background-design': 'Transparent' });
    wrap.appendChild(el);
    const a = node.attrs;
    let key;
    const tabs = () => [...el.querySelectorAll('ui5-tab')];
    const keyOf = (t) => t.dataset.key || t.getAttribute('data-ui5-id') || '';
    const sync = () => {
      const all = tabs();
      const hit = all.find((t) => keyOf(t) === String(key ?? '')) || (key ? null : all[0]);
      if (hit) for (const t of all) t.selected = t === hit;
    };
    const groups = api.renderer.groups(node, { defaultAggregation: 'items' });
    api.aggregation(node, 'items', (kids) => {
      kids.forEach((k) => el.appendChild(k));
      sync();
    }, { groups });
    if (groups.has('content')) {
      const shared = api.el('div', { class: 'a2u-icontabbar-content' });
      api.aggregation(node, 'content', (k) => k.forEach((x) => shared.appendChild(x)), { groups });
      wrap.appendChild(shared);
    }
    api.prop(el, 'selectedKey', {
      set: (e, v) => { key = v; sync(); },
      twoWay: { event: 'tab-select', read: (e) => { const t = tabs().find((x) => x.selected); return t ? keyOf(t) : ''; } },
    });
    if (a.expandable !== undefined || a.expanded !== undefined) api.bind(a.expanded ?? 'true', (v) => el.toggleAttribute('collapsed', !api.toBool(v)));
    if (a.headerBackgroundDesign !== undefined) api.bind(a.headerBackgroundDesign, (v) => el.setAttribute('header-background-design', v === 'Transparent' ? 'Transparent' : 'Solid'));
    if (a.headerMode !== undefined) api.bind(a.headerMode, (v) => el.setAttribute('tab-layout', v === 'Inline' ? 'Inline' : 'Standard'));
    if (a.select) {
      api.wire(el, 'select', {
        on: 'tab-select',
        params: (ev) => {
          const t = ev.detail && ev.detail.tab;
          return { key: t ? keyOf(t) : '', selectedKey: t ? keyOf(t) : '', item: t, selectedItem: t };
        },
      });
    }
    return wrap;
  },
  defaultAggregation: 'items',
  read: { selectedKey: (wrap) => { const t = [...wrap.querySelectorAll('ui5-tab')].find((x) => x.selected); return t ? (t.dataset.key || '') : ''; } },
  status: 'basic',
  note: 'tabs with text, icon, count, iconColor and content; selectedKey, select; no expand/collapse event, no drag & drop',
});

define('sap.m.IconTabFilter', {
  render(node, api) {
    const el = api.el('ui5-tab');
    const a = node.attrs;
    api.bind(a.key ?? '', (v) => { el.dataset.key = v || node.attrs.id || ''; });
    api.bind(a.text ?? '', (v) => (v ? el.setAttribute('text', v) : el.removeAttribute('text')));
    if (a.icon !== undefined) api.bind(a.icon, (v) => (v ? el.setAttribute('icon', iconName(v)) : el.removeAttribute('icon')));
    if (a.count !== undefined) api.bind(a.count, (v) => (v !== '' && v !== undefined && v !== null ? el.setAttribute('additional-text', String(v)) : el.removeAttribute('additional-text')));
    if (a.iconColor !== undefined) api.bind(a.iconColor, (v) => el.setAttribute('design', TAB_DESIGN[v] || 'Default'));
    if (a.enabled !== undefined) api.bind(a.enabled, (v) => el.toggleAttribute('disabled', !api.toBool(v)));
    const groups = api.renderer.groups(node, { defaultAggregation: 'content' });
    api.aggregation(node, 'content', (k) => k.forEach((x) => el.appendChild(x)), { groups });
    if (groups.has('items')) api.aggregation(node, 'items', (k) => k.forEach((x) => { x.setAttribute('slot', 'items'); el.appendChild(x); }), { groups });
    return el;
  },
  defaultAggregation: 'content',
  read: { key: (el) => el.dataset.key, text: (el) => el.getAttribute('text') || '' },
});
define('sap.m.IconTabSeparator', { render: (node, api) => api.el('ui5-tab-separator') });

export { text };
