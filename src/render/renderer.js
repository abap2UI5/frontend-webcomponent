/*
 * View XML -> DOM of UI5 Web Components.
 *
 * The XML is parsed by the vendored viewxml.mjs (namespaces resolved, so
 * `<Input>` under xmlns="sap.m" is sap.m.Input). Every control element is
 * looked up in the control registry (render/registry.js): one small mapper
 * per UI5 control that names the web component, maps properties, aggregation
 * -> slot, and events. A control without a mapper renders as a visible
 * "unsupported control" box and is reported - the view never fails as a
 * whole.
 *
 * Bindings are compiled once per attribute (bindings/binding.js) and
 * evaluated in a binding context { models, path }; every bound property
 * subscribes to its model, so a two-way edit or a model push re-reads it in
 * place. Bound aggregations render their template once per row and render
 * again when the rows change. Everything a rendering subscribes to belongs
 * to a Scope, disposed when the view (or the aggregation) is rebuilt.
 *
 * The mapper API (`api` below) is what a mapper's render() gets.
 */
import { parseViewXml, isAggregation, controlName } from '../vendor/agent/viewxml.mjs';
import { compileProperty, compileAggregation, aggregationRows } from '../bindings/binding.js';
import { META, metaOf, readWire, computeArgs } from './wires.js';

export class Scope {
  constructor(parent = null) {
    this.subs = [];
    this.children = new Set();
    this.parent = parent;
    if (parent) parent.children.add(this);
  }

  child() {
    return new Scope(this);
  }

  add(unsub) {
    this.subs.push(unsub);
  }

  dispose() {
    for (const c of [...this.children]) c.dispose();
    for (const u of this.subs) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
    this.subs = [];
    if (this.parent) this.parent.children.delete(this);
  }
}

const cache = new Map();
/** compileProperty with a cache: the same attribute text compiles once. */
export function compiled(raw) {
  let c = cache.get(raw);
  if (!c) {
    c = compileProperty(raw);
    if (cache.size > 5000) cache.clear();
    cache.set(raw, c);
  }
  return c;
}

/* Attributes every control has, handled here and not by the mappers. */
const COMMON = new Set(['id', 'class', 'visible', 'binding', 'tooltip', 'fieldGroupIds', 'busy', 'busyIndicatorDelay', 'busyIndicatorSize', 'blocked']);
const IGNORED_ATTR = /^(xmlns(:.*)?|core:require|.*:require|displayBlock|controllerName|templateShareable|ariaLabelledBy|ariaDescribedBy|width|height)$/;

export const toBool = (v) => v === true || v === 'true' || v === 'X' || (typeof v === 'number' && v !== 0);

export class Renderer {
  /**
   * @param {object} o
   * @param {Document} o.document
   * @param {object} o.registry          render/registry.js
   * @param {Function} o.report          ({ kind, detail, control? }) => void
   * @param {Function} o.onEvent         ({ slot, wire, args, el }) => void
   */
  constructor({ document, registry, report, onEvent }) {
    this.doc = document;
    this.registry = registry;
    this.report = report;
    this.onEvent = onEvent;
  }

  /** Render a view or fragment XML for `slot` -> { nodes, scope, ids }. */
  renderXml(xml, { slot, models }) {
    const tree = parseViewXml(xml);
    const scope = new Scope();
    const ids = new Map();
    const ctx = { models, path: '', slot, scope, ids };
    const nodes = [];
    for (const node of tree.children) {
      const el = this.control(node, ctx);
      if (el) nodes.push(el);
    }
    return { nodes, scope, ids, tree };
  }

  /** One control element -> its DOM element (or null for an invisible helper). */
  control(node, ctx) {
    let name = controlName(node);
    let mapper = this.registry.get(name);
    if (!mapper && !node.ns) {
      // an element without a resolvable namespace (a view that forgot its
      // xmlns:form): the sap.m / layout name of the same local name
      for (const lib of ['sap.m', 'sap.ui.layout.form', 'sap.ui.layout', 'sap.ui.core', 'sap.f']) {
        mapper = this.registry.get(`${lib}.${node.local}`);
        if (mapper) {
          name = `${lib}.${node.local}`;
          break;
        }
      }
    }
    if (!mapper) return this.unsupported(node, name, ctx);
    let c = ctx;
    if (node.attrs.binding !== undefined) {
      const b = compiled(node.attrs.binding);
      if (b.kind === 'path') {
        const target = b.part.relative ? `${ctx.path}/${b.part.path}` : b.part.path;
        c = { ...ctx, path: target.replace(/\/+/g, '/') };
      } else {
        this.report({ kind: 'binding', detail: `element binding ${node.attrs.binding}`, control: name });
      }
    }
    const api = this.api(name, c);
    api.node = node;
    let el;
    try {
      el = mapper.render ? mapper.render(node, api, c) : this.generic(mapper, node, api, c);
    } catch (e) {
      console.error(`[abap2ui5-wc] rendering ${name} failed`, e);
      return this.unsupported(node, `${name} (render error: ${e.message})`, ctx);
    }
    if (!el) return null;
    this.common(el, node, mapper, api, c, name);
    return el;
  }

  /** The visible stand-in for a control this frontend has no mapper for. */
  unsupported(node, name, ctx) {
    this.report({ kind: 'control', detail: name, control: name });
    const box = this.doc.createElement('div');
    box.className = 'a2u-unsupported';
    box.setAttribute('data-a2u-unsupported', name);
    box.textContent = `unsupported control ${name}`;
    // its children may still be portable: render them below, so content is not lost
    const kids = this.doc.createElement('div');
    kids.className = 'a2u-unsupported-content';
    for (const child of node.children) {
      if (isAggregation(child)) {
        for (const g of child.children) {
          const e = this.control(g, ctx);
          if (e) kids.appendChild(e);
        }
      } else {
        const e = this.control(child, ctx);
        if (e) kids.appendChild(e);
      }
    }
    if (kids.childNodes.length) box.appendChild(kids);
    return box;
  }

  /** id, class, visible, tooltip - for every control. */
  common(el, node, mapper, api, ctx, name) {
    const id = node.attrs.id;
    el[META] = { node, ctx, mapper, api, id: id || '', control: name };
    el.setAttribute('data-ui5-control', name);
    if (id) {
      el.setAttribute('data-ui5-id', id);
      if (!ctx.inTemplate) {
        if (!ctx.ids.has(id)) ctx.ids.set(id, el);
        if (!el.id) el.id = `${ctx.slot}--${id}`;
      }
    }
    if (node.attrs.class !== undefined) {
      let applied = [];
      api.bind(node.attrs.class, (v) => {
        for (const c of applied) el.classList.remove(c);
        applied = String(v ?? '').split(/\s+/).filter(Boolean);
        for (const c of applied) el.classList.add(c);
      });
    }
    if (node.attrs.visible !== undefined) {
      api.bind(node.attrs.visible, (v) => {
        const hide = !toBool(v) && v !== undefined && v !== '';
        el.hidden = hide;
        el.style.display = hide ? 'none' : (el.dataset.a2uDisplay || '');
      });
    }
    if (node.attrs.tooltip !== undefined && !(mapper.props && mapper.props.tooltip)) {
      api.bind(node.attrs.tooltip, (v) => (v ? el.setAttribute('title', String(v)) : el.removeAttribute('title')));
    }
    if (!(mapper.props && mapper.props.width) && node.attrs.width !== undefined && !mapper.noSize) api.bind(node.attrs.width, (v) => { el.style.width = v || ''; });
    if (!(mapper.props && mapper.props.height) && node.attrs.height !== undefined && !mapper.noSize) api.bind(node.attrs.height, (v) => { el.style.height = v || ''; });
    const ld = node.children.find((c) => isAggregation(c) && c.local === 'layoutData');
    if (ld) this.layoutData(el, ld, ctx);
    const cd = node.children.find((c) => isAggregation(c) && c.local === 'customData');
    if (cd) {
      for (const d of cd.children) {
        if (!d.attrs.key || !/^[A-Za-z][\w-]*$/.test(d.attrs.key)) continue;
        api.bind(d.attrs.value ?? '', (v) => el.setAttribute(`data-${d.attrs.key.toLowerCase()}`, v ?? ''));
      }
    }
  }

  /* FlexItemData / GridData on a child: the few fields the layouts read. */
  layoutData(el, agg, ctx) {
    for (const d of agg.children) {
      const n = controlName(d);
      const api = this.api(n, ctx);
      if (n === 'sap.m.FlexItemData') {
        if (d.attrs.growFactor !== undefined) api.bind(d.attrs.growFactor, (v) => { el.style.flexGrow = v; });
        if (d.attrs.shrinkFactor !== undefined) api.bind(d.attrs.shrinkFactor, (v) => { el.style.flexShrink = v; });
        if (d.attrs.baseSize !== undefined) api.bind(d.attrs.baseSize, (v) => { el.style.flexBasis = v; });
        if (d.attrs.minWidth !== undefined) api.bind(d.attrs.minWidth, (v) => { el.style.minWidth = v; });
        if (d.attrs.alignSelf !== undefined) api.bind(d.attrs.alignSelf, (v) => { el.style.alignSelf = FLEX_ALIGN[v] || ''; });
        if (d.attrs.styleClass !== undefined) api.bind(d.attrs.styleClass, (v) => { if (v) el.classList.add(...String(v).split(/\s+/).filter(Boolean)); });
      } else if (n === 'sap.ui.layout.GridData') {
        if (d.attrs.span !== undefined) el.dataset.a2uSpan = d.attrs.span;
        if (d.attrs.linebreak === 'true') el.style.gridColumnStart = '1';
      } else if (n === 'sap.m.OverflowToolbarLayoutData') {
        if (d.attrs.priority !== undefined) el.setAttribute('data-a2u-overflow', api.evaluate(d.attrs.priority) || '');
      } else if (n === 'sap.ui.layout.ResponsiveFlowLayoutData' || n === 'sap.ui.layout.form.ColumnElementData') {
        // layout hints of layouts rendered as CSS grid here - no effect
      } else {
        this.report({ kind: 'layoutData', detail: n, control: n });
      }
    }
  }

  /**
   * The generic mapper: create `mapper.tag`, apply mapped properties and
   * events, place aggregations into slots.
   */
  generic(mapper, node, api, ctx) {
    const el = this.doc.createElement(mapper.tag);
    if (mapper.init) mapper.init(el, node, api, ctx);
    this.applyAttributes(el, mapper, node, api);
    this.aggregations(el, mapper, node, api);
    if (mapper.after) mapper.after(el, node, api, ctx);
    return el;
  }

  applyAttributes(el, mapper, node, api, { skip = [] } = {}) {
    const props = mapper.props || {};
    const events = mapper.events || {};
    const aggs = mapper.aggregations || {};
    for (const attr of Object.keys(node.attrs)) {
      if (skip.includes(attr) || COMMON.has(attr) || IGNORED_ATTR.test(attr) && !props[attr]) continue;
      if (events[attr]) {
        api.wire(el, attr, events[attr]);
        continue;
      }
      if (props[attr] === 'ignore') continue;
      if (props[attr]) {
        api.prop(el, attr, props[attr]);
        continue;
      }
      if (aggs[attr] || attr === mapper.defaultAggregation) continue;
      if (attr.includes(':')) continue;
      this.report({ kind: 'property', detail: `${api.control}.${attr}`, control: api.control });
    }
    for (const [name, spec] of Object.entries(props)) {
      if (spec && spec.default !== undefined && node.attrs[name] === undefined) api.apply(el, spec, spec.default);
    }
  }

  /** Children of a control grouped by aggregation name. */
  groups(node, mapper) {
    const out = new Map();
    const def = (mapper && mapper.defaultAggregation) || 'content';
    for (const child of node.children) {
      if (isAggregation(child)) {
        if (child.local === 'layoutData' || child.local === 'customData' || child.local === 'dependents' || child.local === 'dragDropConfig') continue;
        const list = out.get(child.local) || [];
        list.push(...child.children);
        out.set(child.local, list);
      } else {
        const list = out.get(def) || [];
        list.push(child);
        out.set(def, list);
      }
    }
    return out;
  }

  aggregations(el, mapper, node, api) {
    const aggs = mapper.aggregations || {};
    const groups = this.groups(node, mapper);
    const names = new Set([...groups.keys(), ...Object.keys(aggs).filter((a) => node.attrs[a] !== undefined)]);
    for (const name of names) {
      const spec = aggs[name];
      if (!spec) {
        if ((groups.get(name) || []).length) this.report({ kind: 'aggregation', detail: `${api.control}.${name}`, control: api.control });
        continue;
      }
      if (spec === 'ignore') continue;
      api.aggregation(node, name, (children) => {
        for (const c of children) {
          if (spec.slot) c.setAttribute('slot', spec.slot);
          if (spec.wrap) {
            const w = spec.wrap(c, api);
            (spec.into ? spec.into(el) : el).appendChild(w);
          } else {
            (spec.into ? spec.into(el) : el).appendChild(c);
          }
        }
      }, { groups, spec });
    }
  }

  /** The API a mapper gets for one control in one binding context. */
  api(control, ctx) {
    const r = this;
    const api = {
      control,
      ctx,
      doc: r.doc,
      renderer: r,
      report: (kind, detail) => r.report({ kind, detail, control }),
      toBool,

      /** Evaluate a property value (literal or binding) now. */
      evaluate(raw, c = ctx) {
        const b = compiled(raw);
        return b.get(c);
      },

      /** Evaluate and keep evaluating: `apply(value)` now and on every model change. */
      bind(raw, apply, c = ctx) {
        const b = compiled(raw);
        for (const issue of b.issues) r.report({ ...issue, control });
        const NONE = {};
        let last = NONE;
        const run = () => {
          const v = b.get(c);
          if (v === last && typeof v !== 'object') return;
          last = v;
          apply(v);
        };
        run();
        if (b.kind !== 'literal') {
          for (const m of Object.values(c.models)) {
            if (m && m.subscribe) c.scope.add(m.subscribe(run));
          }
        }
        // a two-way write changes the control first: the next read must apply
        return { ...b, reset: () => { last = NONE; } };
      },

      /** Apply a property spec to an element. */
      apply(el, spec, value) {
        let v = value;
        if (spec.bool) v = toBool(v);
        if (spec.invert) v = !v;
        if (spec.map) v = Object.prototype.hasOwnProperty.call(spec.map, v) ? spec.map[v] : (spec.mapDefault !== undefined ? spec.mapDefault : v);
        if (spec.convert) v = spec.convert(v, el, api);
        if (spec.set) return spec.set(el, v, api);
        if (spec.prop) {
          el[spec.prop] = spec.number ? (v === '' || v === null || v === undefined ? 0 : Number(v)) : (v ?? (spec.bool ? false : ''));
        }
        if (spec.attr) {
          if (spec.bool) el.toggleAttribute(spec.attr, !!v);
          else if (v === undefined || v === null || v === '') el.removeAttribute(spec.attr);
          else el.setAttribute(spec.attr, String(v));
        }
        if (spec.text) el.textContent = v === undefined || v === null ? '' : String(v);
        if (spec.style) el.style[spec.style] = v === undefined || v === null ? '' : String(v);
        return undefined;
      },

      /** A mapped property: bind, apply, and the two-way write-back. */
      prop(el, attr, spec, c = ctx) {
        const b = api.bind(api.node.attrs[attr], (v) => api.apply(el, spec, v), c);
        if (spec.twoWay && b.kind === 'path') {
          const tw = spec.twoWay;
          const write = (notify) => {
            const t = b.target(c);
            if (!t) return;
            let v = tw.read(el);
            if (spec.invert) v = !v;
            b.reset();
            t.model.set(t.path, b.parse(v), { notify });
          };
          // capture: at the target, capturing listeners run before the event
          // wires - the model holds the new value when the roundtrip reads it
          for (const evn of [].concat(tw.event)) el.addEventListener(evn, () => write(true), true);
          if (tw.live) el.addEventListener(tw.live, () => write(false), true);
        }
        return b;
      },

      /**
       * An event attribute: parse the wire and fire it on `spec.on`.
       * spec.params(ev, el) -> the UI5 event parameters.
       */
      wire(el, attr, spec, c = ctx, node = api.node) {
        const raw = node.attrs[attr];
        const w = readWire(raw);
        if (!w) {
          r.report({ kind: 'event', detail: `${control}.${attr}: handler ${String(raw).slice(0, 60)} is no abap2UI5 wire`, control });
          return;
        }
        const handler = (ev) => {
          if (spec.filter && !spec.filter(ev, el)) return;
          if (w.veto && ev && typeof ev.preventDefault === 'function') ev.preventDefault();
          if (spec.before) spec.before(ev, el);
          const params = spec.params ? spec.params(ev, el) : {};
          const args = computeArgs(w, {
            el, ctx: c, params, api, report: (d) => r.report({ kind: 'event-arg', detail: `${control}.${attr}: ${d}`, control }),
          });
          r.onEvent({ slot: c.slot, wire: w, args, el, control, attr });
        };
        const on = Array.isArray(spec.on) ? spec.on : [spec.on];
        const target = spec.target ? spec.target(el) : el;
        for (const name of on) target.addEventListener(name, handler);
      },

      /** Render the controls of one aggregation (bound or static) and hand them to `mount`. */
      aggregation(node, name, mount, { groups, c = ctx, template } = {}) {
        const g = groups || r.groups(node, r.registry.get(control));
        const children = g.get(name) || [];
        const bindingRaw = node.attrs[name];
        const agg = bindingRaw !== undefined ? compileAggregation(bindingRaw) : null;
        if (agg && agg.unsupported) r.report({ kind: 'binding', detail: `${control}.${name}: ${agg.unsupported}`, control });
        if (!agg || agg.unsupported) {
          const els = children.map((ch) => r.control(ch, c)).filter(Boolean);
          mount(els, []);
          return els;
        }
        for (const issue of agg.issues) r.report({ ...issue, control });
        const tpl = template || children[0];
        if (!tpl) {
          mount([], []);
          return [];
        }
        let current = [];
        let scope = null;
        let signature = null;
        const build = () => {
          const { rows } = aggregationRows(agg, c);
          const sig = rows.map((x) => x.path).join('|');
          if (sig === signature) return;
          signature = sig;
          if (scope) scope.dispose();
          scope = c.scope.child();
          const old = current;
          for (const e of old) e.remove();
          current = rows.map((row) => r.control(tpl, { ...c, path: row.path, scope, inTemplate: true, rowKey: row.key })).filter(Boolean);
          mount(current, old);
        };
        build();
        for (const m of Object.values(c.models)) if (m && m.subscribe) c.scope.add(m.subscribe(build));
        return current;
      },

      /** Render one child control node. */
      child(n, c2 = ctx) {
        return r.control(n, c2);
      },

      el(tag, attrs = {}, kids = []) {
        const e = r.doc.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
          if (v === undefined || v === null || v === false) continue;
          if (k === 'class') e.className = v;
          else if (k === 'text') e.textContent = v;
          else e.setAttribute(k, v === true ? '' : String(v));
        }
        for (const k of kids) if (k) e.appendChild(k);
        return e;
      },
    };
    return api;
  }
}

export const FLEX_ALIGN = {
  Start: 'flex-start', Begin: 'flex-start', End: 'flex-end', Center: 'center', Stretch: 'stretch', Baseline: 'baseline', Inherit: '', Auto: 'auto',
};

export { metaOf };
