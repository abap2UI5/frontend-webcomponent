/*
 * Property and aggregation bindings of the portable profile, compiled once
 * per attribute and evaluated per binding context.
 *
 *   compileProperty(raw)  -> Binding
 *     binding.kind        'literal' | 'path' | 'expression' | 'composite'
 *     binding.get(ctx)    the value to show (typed bindings formatted)
 *     binding.target(ctx) { model, path } for a two-way write, or null
 *     binding.parse(v)    a control value back into the model's type
 *     binding.issues      what this frontend does not support (formatters
 *                         outside the profile, unknown types, named models it
 *                         does not have)
 *
 *   compileAggregation(raw) -> { path, model, relative, issues } | null
 *
 * A binding context is { models: { '': Model, device: Model, ... }, path }
 * where `path` is the context path relative bindings resolve against
 * ('/T_TAB/3' inside a table row, '' at the view's root).
 *
 * Expressions are compiled once by bindings/expression.js (the profile's
 * grammar: the vendored viewxml.mjs evaluator's plus Math.* and string
 * methods) - a small parser, never eval.
 */
import { parseObjectLiteral } from './objectsyntax.js';
import { compileExpression, evaluate } from './expression.js';
import { formatValue, formatAmount, parseValue, isKnownType, shortType } from './types.js';
import { resolveFormatter } from './formatters.js';

/** Split a property value into literal text and `{...}` binding bodies,
 *  the way the UI5 binding parser does (nesting, quotes, `\{` escapes). */
export function splitParts(value) {
  const s = String(value);
  const parts = [];
  let lit = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '{' || s[i + 1] === '}' || s[i + 1] === '\\')) {
      lit += s[i + 1];
      i += 2;
      continue;
    }
    if (c === '{') {
      let depth = 0;
      let quote = null;
      let j = i;
      for (; j < s.length; j += 1) {
        const d = s[j];
        if (quote) {
          if (d === '\\') {
            j += 1;
            continue;
          }
          if (d === quote) quote = null;
          continue;
        }
        if (d === '"' || d === "'") {
          quote = d;
          continue;
        }
        if (d === '{') depth += 1;
        else if (d === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (j >= s.length) {
        lit += s.slice(i);
        break;
      }
      if (lit) parts.push({ text: lit });
      lit = '';
      parts.push({ body: s.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    lit += c;
    i += 1;
  }
  if (lit) parts.push({ text: lit });
  return parts;
}

const SIMPLE = /^\s*(?:([A-Za-z_][\w.-]*)>)?(\/?[\w$/.-]*)\s*$/;

/** `model>path` -> { model, path, relative }. */
export function splitPath(p) {
  const m = /^(?:([A-Za-z_][\w.-]*)>)?(.*)$/.exec(String(p).trim());
  return { model: m[1] || '', path: m[2], relative: !m[2].startsWith('/') };
}

/** One binding body -> a part descriptor. */
export function describeBody(body) {
  const b = String(body).trim();
  if (b.startsWith('=') || b.startsWith(':=')) {
    const expression = b.replace(/^:?=/, '');
    try {
      return { expression, tree: compileExpression(expression) };
    } catch (e) {
      return { expression, unsupported: `expression {=${expression.trim().slice(0, 60)}}: ${e.message}`, kind: 'expression' };
    }
  }
  const simple = SIMPLE.exec(b);
  if (simple && simple[2] !== '') return { ...splitPath(b) };
  let o;
  try {
    o = parseObjectLiteral(b);
  } catch (e) {
    return { unsupported: `binding syntax not understood: {${b.slice(0, 60)}}` };
  }
  const out = {};
  if (typeof o.path === 'string') Object.assign(out, splitPath(o.model ? `${o.model}>${o.path}` : o.path));
  if (Array.isArray(o.parts)) {
    out.parts = o.parts.map((p) => {
      if (typeof p === 'string') return splitPath(p);
      if (p && typeof p.path === 'string') {
        return { ...splitPath(p.model ? `${p.model}>${p.path}` : p.path), type: typeName(p.type), formatOptions: p.formatOptions };
      }
      return { unsupported: 'a part without a path' };
    });
  }
  if (o.type !== undefined) out.type = typeName(o.type);
  if (o.formatOptions) out.formatOptions = o.formatOptions;
  if (o.formatter !== undefined) {
    out.formatter = typeof o.formatter === 'string' ? o.formatter : (o.formatter.$ident || 'formatter');
    out.formatterFn = resolveFormatter(out.formatter);
  }
  if (o.targetType) out.targetType = o.targetType;
  if (out.path === undefined && !out.parts) out.unsupported = `binding without path: {${b.slice(0, 60)}}`;
  return out;
}

const typeName = (t) => (t && typeof t === 'object' ? t.$ident || '' : t || '');

/** Resolve a path descriptor in a context -> { model, path } (model may be undefined). */
export function resolve(desc, ctx) {
  const models = (ctx && ctx.models) || {};
  const model = models[desc.model || ''];
  let path = desc.path;
  if (desc.relative) {
    const base = (ctx && (desc.model ? (ctx.namedPaths || {})[desc.model] : ctx.path)) || '';
    path = path ? `${base}/${path}` : base;
  }
  return { model, path: path.replace(/\/+/g, '/') };
}

function read(desc, ctx) {
  const { model, path } = resolve(desc, ctx);
  return model ? model.get(path) : undefined;
}

/** The getter evalExpression asks for `${ref}`. */
export const exprGetter = (ctx) => (ref) => read(splitPath(ref), ctx);

const display = (v) => (v === null || v === undefined ? '' : v instanceof Date ? String(v) : typeof v === 'object' ? JSON.stringify(v) : String(v));

function partValue(part, ctx) {
  if (part.text !== undefined) return part.text;
  if (part.expression !== undefined) return part.tree ? evaluate(part.tree, exprGetter(ctx)) : undefined;
  if (part.unsupported) return `[${part.unsupported}]`;
  if (part.formatter) {
    if (!part.formatterFn) return `[formatter ${part.formatter}]`;
    // the formatter gets the (typed) value of every part, as in UI5
    const values = part.parts
      ? part.parts.map((p) => (p.unsupported ? undefined : formatTyped(read(p, ctx), p)))
      : [formatTyped(read(part, ctx), part)];
    try {
      return part.formatterFn(...values);
    } catch {
      return undefined;
    }
  }
  if (part.parts) {
    const values = part.parts.map((p) => (p.unsupported ? '' : formatTyped(read(p, ctx), p)));
    if (part.type && ['Currency', 'Unit'].includes(shortType(part.type))) return formatAmount(values, part.type, part.formatOptions);
    return values.map(display).join(' ');
  }
  return formatTyped(read(part, ctx), part);
}

function formatTyped(v, part) {
  if (!part.type || !isKnownType(part.type)) return v;
  return formatValue(v, part.type, part.formatOptions);
}

function issuesOf(part) {
  const out = [];
  if (part.unsupported) out.push({ kind: part.kind || 'binding', detail: part.unsupported });
  if (part.formatter && !part.formatterFn) out.push({ kind: 'formatter', detail: part.formatter });
  if (part.type && !isKnownType(part.type)) out.push({ kind: 'type', detail: part.type });
  for (const p of part.parts || []) out.push(...issuesOf(p));
  return out;
}

export function compileProperty(raw) {
  if (raw === undefined || raw === null) return { kind: 'literal', literal: undefined, get: () => undefined, target: () => null, parse: (v) => v, issues: [] };
  const parts = splitParts(raw).map((p) => (p.body !== undefined ? describeBody(p.body) : p));
  const bindings = parts.filter((p) => p.text === undefined);
  const issues = bindings.flatMap(issuesOf);
  if (!bindings.length) {
    const literal = parts.map((p) => p.text).join('');
    return { kind: 'literal', literal, get: () => literal, target: () => null, parse: (v) => v, issues };
  }
  if (parts.length === 1) {
    const part = parts[0];
    if (part.expression !== undefined) {
      return { kind: 'expression', get: (ctx) => partValue(part, ctx), target: () => null, parse: (v) => v, issues, part };
    }
    if (part.path !== undefined && !part.parts && !part.formatter && !part.unsupported) {
      const typed = part.type && isKnownType(part.type);
      return {
        kind: 'path',
        part,
        get: (ctx) => partValue(part, ctx),
        target: (ctx) => {
          const r = resolve(part, ctx);
          return r.model && !r.model.readOnly ? r : null;
        },
        parse: (v) => (typed ? parseValue(v, part.type, part.formatOptions) : v),
        issues,
      };
    }
    return { kind: 'composite', get: (ctx) => partValue(part, ctx), target: () => null, parse: (v) => v, issues, part };
  }
  return {
    kind: 'composite',
    get: (ctx) => parts.map((p) => display(partValue(p, ctx))).join(''),
    target: () => null,
    parse: (v) => v,
    issues,
  };
}

/** An aggregation binding (`items="{/T_TAB}"`, `{path: '/T', sorter: ...}`). */
export function compileAggregation(raw) {
  if (raw === undefined || raw === null) return null;
  const parts = splitParts(raw);
  if (parts.length !== 1 || parts[0].body === undefined) return null;
  const desc = describeBody(parts[0].body);
  if (desc.path === undefined) return { unsupported: desc.unsupported || 'aggregation binding without path', issues: [] };
  const issues = [];
  let o;
  try {
    o = /:/.test(parts[0].body) && !SIMPLE.test(parts[0].body) ? parseObjectLiteral(parts[0].body) : null;
  } catch {
    o = null;
  }
  const out = { model: desc.model, path: desc.path, relative: desc.relative, issues };
  if (o && o.sorter) {
    const s = Array.isArray(o.sorter) ? o.sorter : [o.sorter];
    out.sorter = s.filter((x) => x && typeof x.path === 'string').map((x) => ({ path: x.path, descending: !!x.descending }));
    if (s.some((x) => x && x.group)) issues.push({ kind: 'binding', detail: 'sorter grouping is not rendered' });
  }
  if (o && o.filters) issues.push({ kind: 'binding', detail: 'aggregation filters are ignored' });
  if (o && typeof o.length === 'number') out.length = o.length;
  if (o && typeof o.startIndex === 'number') out.startIndex = o.startIndex;
  return out;
}

/** The rows an aggregation binding iterates: [{ index, path }] in display order. */
export function aggregationRows(agg, ctx) {
  const r = resolve(agg, ctx);
  const data = r.model ? r.model.get(r.path) : undefined;
  let keys = [];
  if (Array.isArray(data)) keys = data.map((_, i) => i);
  else if (data && typeof data === 'object') keys = Object.keys(data);
  let rows = keys.map((k) => ({ key: k, path: `${r.path === '/' ? '' : r.path}/${k}`, value: data[k] }));
  if (agg.sorter && agg.sorter.length) {
    rows = rows.slice().sort((a, b) => {
      for (const s of agg.sorter) {
        const va = a.value ? a.value[s.path] : undefined;
        const vb = b.value ? b.value[s.path] : undefined;
        if (va === vb) continue;
        const c = va === undefined ? -1 : vb === undefined ? 1 : va < vb ? -1 : 1;
        return s.descending ? -c : c;
      }
      return 0;
    });
  }
  const start = agg.startIndex || 0;
  if (start || agg.length) rows = rows.slice(start, agg.length ? start + agg.length : undefined);
  return { model: r.model, path: r.path, rows };
}
