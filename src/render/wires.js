/*
 * Event wires -> the arguments a roundtrip carries.
 *
 * The backend writes an abap2UI5 event handler into the view attribute
 * (`press=".eB(['SAVE'], ${NAME}, ${$source>/text})"`); the vendored
 * viewxml.mjs parseWire reads it into an event name, flags and argument
 * descriptors. This module computes each argument in the browser, from
 * what the web component and the binding context hold at the moment the
 * event fires:
 *
 *   static        'X', 42, true                    the literal
 *   row           ${REL}                           the bound row's property
 *   model         ${/ABS}                          the model, read now
 *   source        ${$source>/text}                 the source control's property
 *   parameters    ${$parameters>/value}            the UI5 event parameter
 *   event         $event                           null (a UI5 object has no JSON form)
 *   expr          anything else                    a member chain over $event,
 *                                                  $source, $parameters and
 *                                                  ${...} references - e.g.
 *                                                  `${$parameters>/listItem}.getBindingContext().getProperty('ID')`,
 *                                                  `$event.oSource.oParent.sId`;
 *                                                  evaluated by a tiny parser,
 *                                                  never eval. Unknown -> null + report.
 *
 * A "control" in such a chain is a ControlProxy over the rendered element:
 * get<Prop>() reads the UI5 property (the mapper's live value, else the
 * attribute resolved in its binding context), getId()/sId the view id,
 * getBindingContext() its context, getParent()/oParent the enclosing control.
 */
import { parseWire } from '../vendor/agent/viewxml.mjs';
import { splitPath, resolve } from '../bindings/binding.js';

export const META = Symbol.for('abap2ui5-wc.meta');

/** The rendered control an element belongs to: { node, ctx, mapper, api, id }. */
export const metaOf = (el) => (el && el[META]) || null;

export class ControlProxy {
  constructor(el) {
    this.el = el;
  }

  get meta() {
    return metaOf(this.el);
  }

  getId() {
    const m = this.meta;
    return (m && m.id) || '';
  }

  get sId() {
    return this.getId();
  }

  getParent() {
    let p = this.el.parentElement || (this.el.getRootNode && this.el.getRootNode().host);
    while (p && !metaOf(p)) p = p.parentElement || (p.getRootNode && p.getRootNode() !== p && p.getRootNode().host) || null;
    return p ? new ControlProxy(p) : null;
  }

  get oParent() {
    return this.getParent();
  }

  getBindingContext() {
    const m = this.meta;
    if (!m || !m.ctx || !m.ctx.path) return null;
    const ctx = m.ctx;
    return {
      getPath: () => ctx.path,
      getProperty: (p) => {
        const r = resolve({ ...splitPath(String(p)), relative: !String(p).startsWith('/') }, ctx);
        return r.model ? r.model.get(r.path) : undefined;
      },
      getObject: () => (ctx.models[''] ? ctx.models[''].get(ctx.path) : undefined),
    };
  }

  /** A UI5 property of the control, by name. */
  prop(name) {
    const m = this.meta;
    if (!m) return undefined;
    if (m.mapper && m.mapper.read && m.mapper.read[name]) return m.mapper.read[name](this.el);
    if (m.api && m.node && m.node.attrs[name] !== undefined) return m.api.evaluate(m.node.attrs[name], m.ctx);
    return undefined;
  }

  toJSON() {
    return this.getId();
  }
}

const isElement = (v) => v && typeof v === 'object' && typeof v.tagName === 'string' && typeof v.getAttribute === 'function';
const wrap = (v) => (isElement(v) ? new ControlProxy(v) : Array.isArray(v) ? v.map(wrap) : v);

/** A value as it goes over the wire (T_EVENT_ARG): controls become their id. */
export function wireValue(v) {
  if (v instanceof ControlProxy) return v.getId();
  if (isElement(v)) return new ControlProxy(v).getId();
  if (Array.isArray(v)) return v.map(wireValue);
  if (v === undefined) return null;
  return v;
}

function walkParams(params, path) {
  let cur = params;
  for (const seg of String(path).split('/').filter(Boolean)) {
    if (cur === null || cur === undefined) return cur;
    cur = cur instanceof ControlProxy ? cur.prop(seg) : cur[seg];
    cur = wrap(cur);
  }
  return cur;
}

/* ------------------------------------------------ the chain evaluator --- */

function tokenize(src) {
  const out = [];
  let i = 0;
  const s = String(src);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '$' && s[i + 1] === '{') {
      const end = s.indexOf('}', i);
      if (end < 0) throw new Error('ref');
      out.push({ t: 'ref', v: s.slice(i + 2, end).trim() });
      i = end + 1;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let v = '';
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\') {
          v += s[j + 1];
          j += 2;
          continue;
        }
        v += s[j];
        j += 1;
      }
      if (j >= s.length) throw new Error('string');
      out.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(s.slice(i));
    if (num && (c !== '-' || !out.length || out[out.length - 1].t === 'p')) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(s.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    if ('.()[],?:'.includes(c)) {
      out.push({ t: 'p', v: c });
      i += 1;
      continue;
    }
    throw new Error(`char ${c}`);
  }
  return out;
}

const UNKNOWN = Symbol('unknown');

function member(obj, name) {
  if (obj === null || obj === undefined) return undefined;
  if (obj instanceof ControlProxy) {
    if (name === 'sId' || name === 'oParent' || name in ControlProxy.prototype) return obj[name];
    return UNKNOWN;
  }
  if (typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, name)) return wrap(obj[name]);
  if (Array.isArray(obj) && name === 'length') return obj.length;
  if (typeof obj === 'string' && name === 'length') return obj.length;
  return UNKNOWN;
}

function call(obj, name, args) {
  if (obj === null || obj === undefined) return undefined;
  if (obj instanceof ControlProxy) {
    if (typeof ControlProxy.prototype[name] === 'function' && name !== 'constructor' && name !== 'prop' && name !== 'toJSON') return wrap(obj[name](...args));
    const m = /^get([A-Z]\w*)$/.exec(name);
    if (m && !args.length) return wrap(obj.prop(m[1][0].toLowerCase() + m[1].slice(1)));
    return UNKNOWN;
  }
  if (typeof obj === 'object' && typeof obj[name] === 'function' && Object.prototype.hasOwnProperty.call(obj, name)) return wrap(obj[name](...args));
  if (typeof obj === 'string' && ['toUpperCase', 'toLowerCase', 'trim'].includes(name)) return obj[name]();
  return UNKNOWN;
}

/**
 * Evaluate a wire argument expression over { $event, $source, params, ref }.
 * Returns UNKNOWN (exported as evalChain.UNKNOWN) for anything outside the
 * supported grammar: primary (. name | . name ( literals ) | [ index ])*
 * with an optional `cond ? a : b` at the top.
 */
export function evalChain(src, env) {
  let tokens;
  try {
    tokens = tokenize(src);
  } catch {
    return UNKNOWN;
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const primary = () => {
    const t = take();
    if (!t) throw new Error('end');
    if (t.t === 'str' || t.t === 'num') return t.v;
    if (t.t === 'ref') return env.ref(t.v);
    if (t.t === 'id') {
      if (t.v === '$event') return env.$event;
      if (t.v === '$source') return env.$source;
      if (t.v === 'true') return true;
      if (t.v === 'false') return false;
      if (t.v === 'null') return null;
      throw new Error('id');
    }
    if (t.v === '(') {
      const v = ternary();
      if (!take() || tokens[pos - 1].v !== ')') throw new Error(')');
      return v;
    }
    throw new Error('token');
  };
  const chain = () => {
    let v = primary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'p') return v;
      if (t.v === '.') {
        take();
        const name = take();
        if (!name || name.t !== 'id') throw new Error('member');
        if (peek() && peek().v === '(') {
          take();
          const args = [];
          while (peek() && peek().v !== ')') {
            args.push(ternary());
            if (peek() && peek().v === ',') take();
          }
          take();
          v = call(v, name.v, args);
        } else {
          v = member(v, name.v);
        }
      } else if (t.v === '[') {
        take();
        const idx = ternary();
        if (!take() || tokens[pos - 1].v !== ']') throw new Error(']');
        v = Array.isArray(v) ? wrap(v[idx]) : member(v, String(idx));
      } else {
        return v;
      }
      if (v === UNKNOWN) throw new Error('unknown');
    }
  };
  const ternary = () => {
    const c = chain();
    if (peek() && peek().v === '?') {
      take();
      const a = ternary();
      if (!take() || tokens[pos - 1].v !== ':') throw new Error(':');
      const b = ternary();
      return c ? a : b;
    }
    return c;
  };
  try {
    const v = ternary();
    return pos === tokens.length ? v : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}
evalChain.UNKNOWN = UNKNOWN;

const truthy = (f) => f === true || f === 'true' || f === 'X';

/** parseWire + the flags of the event array, named. */
export function readWire(value) {
  const w = parseWire(value);
  if (!w) return null;
  if (w.fn === 'eB') {
    const f = w.flags || [];
    w.options = { useMainModel: truthy(f[2]), queueLast: truthy(f[3]), noBusy: truthy(f[4]) };
    w.veto = /^\s*\.?eBP\s*\(\s*\$event\s*,\s*true\b/.test(String(value));
  }
  return w;
}

/**
 * The argument values of a wire fired from `el` with UI5-style event
 * parameters `params`. `report(detail)` is told about every argument this
 * frontend could not compute (it goes out as null).
 */
export function computeArgs(wire, { el, ctx, params = {}, api, report }) {
  const source = new ControlProxy(el);
  const env = {
    $source: source,
    $event: {
      oSource: source,
      getSource: () => source,
      getParameter: (n) => wrap(params[n]),
      getParameters: () => params,
      mParameters: params,
      sId: params.__eventId || '',
    },
    ref: (body) => {
      const par = /^\$parameters>\/?(.*)$/.exec(body);
      if (par) return walkParams(params, par[1]);
      const src = /^\$source>\/?(.+)$/.exec(body);
      if (src) return wrap(source.prop(src[1]));
      return api.evaluate(`{${body}}`, ctx);
    },
  };
  return (wire.args || []).map((d, i) => {
    if (d.static) return d.value;
    let v;
    switch (d.kind) {
      case 'row':
      case 'model':
        v = api.evaluate(`{${d.path}}`, ctx);
        if (v === undefined) v = '';
        break;
      case 'source':
        v = source.prop(d.prop);
        break;
      case 'parameters':
        v = walkParams(params, d.path);
        break;
      case 'event':
        v = null;
        break;
      default:
        v = evalChain(d.raw, env);
        if (v === UNKNOWN) {
          report(`argument ${i} (${d.describe}) is not computable here - sent as null`);
          v = null;
        }
    }
    return wireValue(v);
  });
}
