/*
 * Basic display formatting for typed bindings (`type: 'sap.ui.model.type.Float'`
 * and the odata.type equivalents) - what a portable frontend owes a view so
 * numbers and dates do not show up raw. Deliberately small: the type's
 * formatOptions that matter most (decimals, grouping, pattern, source
 * pattern, style) through Intl; everything else of the UI5 type system
 * (constraints, validation messages, parseKeepsEmptyString, ...) is out of
 * scope and reported once per type name.
 *
 *   formatValue(value, typeName, formatOptions, locale) -> string | value
 *   parseValue(text, typeName, formatOptions)            -> model value
 *   isKnownType(typeName)
 */

const NUMBER_TYPES = new Set(['Integer', 'Float', 'Decimal', 'Int16', 'Int32', 'Int64', 'Byte', 'SByte', 'Double', 'Single']);
const INTEGER_TYPES = new Set(['Integer', 'Int16', 'Int32', 'Int64', 'Byte', 'SByte']);
const DATE_TYPES = new Set(['Date', 'DateTime', 'Time', 'DateTimeOffset', 'TimeOfDay', 'DateTimeWithTimezone']);

/** `sap.ui.model.type.Float` / `sap.ui.model.odata.type.Decimal` -> `Float` / `Decimal`. */
export const shortType = (name) => String(name || '').split('.').pop();

export function isKnownType(name) {
  const t = shortType(name);
  return NUMBER_TYPES.has(t) || DATE_TYPES.has(t) || ['String', 'Boolean', 'Currency', 'Unit'].includes(t);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/*
 * The subset of the LDML patterns UI5 date types take: y M d H h m s a E,
 * literal text in quotes. Enough for the patterns views write
 * (dd.MM.yyyy, yyyy-MM-dd, yyyyMMdd, HH:mm:ss, HHmmss, MMM d, y ...).
 */
export function formatDatePattern(date, pattern, locale) {
  const tokens = String(pattern).match(/'[^']*'|y+|M+|d+|H+|h+|m+|s+|a+|E+|S+|[^'yMdHhmsaES]+/g) || [];
  return tokens.map((t) => {
    if (t[0] === "'") return t.slice(1, -1);
    const n = t.length;
    switch (t[0]) {
      case 'y': return n === 2 ? pad(date.getFullYear() % 100) : String(date.getFullYear()).padStart(n, '0');
      case 'M':
        if (n >= 4) return date.toLocaleString(locale, { month: 'long' });
        if (n === 3) return date.toLocaleString(locale, { month: 'short' });
        return n === 2 ? pad(date.getMonth() + 1) : String(date.getMonth() + 1);
      case 'd': return n === 2 ? pad(date.getDate()) : String(date.getDate());
      case 'H': return n === 2 ? pad(date.getHours()) : String(date.getHours());
      case 'h': {
        const h = date.getHours() % 12 || 12;
        return n === 2 ? pad(h) : String(h);
      }
      case 'm': return n === 2 ? pad(date.getMinutes()) : String(date.getMinutes());
      case 's': return n === 2 ? pad(date.getSeconds()) : String(date.getSeconds());
      case 'S': return String(date.getMilliseconds()).padStart(3, '0').slice(0, n);
      case 'a': return date.getHours() < 12 ? 'AM' : 'PM';
      case 'E': return date.toLocaleString(locale, { weekday: n >= 4 ? 'long' : 'short' });
      default: return t;
    }
  }).join('');
}

/** A date string in a source pattern -> Date (local time), or null. */
export function parseDatePattern(text, pattern) {
  const s = String(text ?? '');
  if (!s) return null;
  const tokens = String(pattern).match(/'[^']*'|y+|M+|d+|H+|h+|m+|s+|S+|[^'yMdHhmsS]+/g) || [];
  let i = 0;
  const parts = { y: 1970, M: 1, d: 1, H: 0, m: 0, s: 0, S: 0 };
  for (const t of tokens) {
    if (t[0] === "'") {
      i += t.length - 2;
      continue;
    }
    const k = t[0];
    if (!'yMdHhmsS'.includes(k)) {
      i += t.length;
      continue;
    }
    const width = t.length >= 2 || k === 'y' ? (k === 'y' && t.length < 4 ? 4 : t.length) : null;
    const m = width ? new RegExp(`^\\d{1,${width}}`).exec(s.slice(i)) : /^\d+/.exec(s.slice(i));
    if (!m) return null;
    parts[k === 'h' ? 'H' : k] = Number(m[0]);
    i += m[0].length;
  }
  const d = new Date(parts.y, parts.M - 1, parts.d, parts.H, parts.m, parts.s, parts.S);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Model value of a date type -> Date: a Date, an ISO string, an ABAP DATS
 *  (yyyyMMdd) / TIMS (HHmmss), `/Date(ms)/`, or the source pattern given. */
function toDate(value, typeShort, source) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === '') return null;
  if (source && source.pattern && source.pattern !== 'timestamp') return parseDatePattern(value, source.pattern);
  if (typeof value === 'number') return new Date(value);
  const s = String(value);
  const ms = /^\/Date\((-?\d+)/.exec(s);
  if (ms) return new Date(Number(ms[1]));
  if (/^\d{8}$/.test(s) && typeShort !== 'Time') return parseDatePattern(s, 'yyyyMMdd');
  if (/^\d{6}$/.test(s) && (typeShort === 'Time' || typeShort === 'TimeOfDay')) return parseDatePattern(s, 'HHmmss');
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return parseDatePattern(s, s.length > 5 ? 'HH:mm:ss' : 'HH:mm');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseDatePattern(s, 'yyyy-MM-dd');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STYLE = { short: 'short', medium: 'medium', long: 'long', full: 'full' };

function formatNumber(value, typeShort, o = {}, locale) {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (Number.isNaN(n)) return String(value);
  const opts = { useGrouping: o.groupingEnabled !== false };
  if (INTEGER_TYPES.has(typeShort)) {
    opts.maximumFractionDigits = 0;
  } else {
    const dec = o.decimals ?? o.maxFractionDigits;
    if (o.decimals !== undefined) opts.minimumFractionDigits = o.decimals;
    else if (o.minFractionDigits !== undefined) opts.minimumFractionDigits = o.minFractionDigits;
    if (dec !== undefined) opts.maximumFractionDigits = Math.max(dec, opts.minimumFractionDigits || 0);
    else opts.maximumFractionDigits = 20;
  }
  if (o.style === 'short' || o.style === 'long') opts.notation = 'compact';
  return new Intl.NumberFormat(locale, opts).format(n);
}

export function formatValue(value, typeName, formatOptions = {}, locale = undefined) {
  const t = shortType(typeName);
  const o = formatOptions || {};
  if (NUMBER_TYPES.has(t)) return formatNumber(value, t, o, locale);
  if (DATE_TYPES.has(t)) {
    const d = toDate(value, t, o.source);
    if (!d) return value === null || value === undefined ? '' : String(value);
    if (o.pattern) return formatDatePattern(d, o.pattern, locale);
    const style = STYLE[o.style] || 'medium';
    if (t === 'Time' || t === 'TimeOfDay') return d.toLocaleTimeString(locale, { timeStyle: style });
    if (t === 'Date') return d.toLocaleDateString(locale, { dateStyle: style });
    return d.toLocaleString(locale, { dateStyle: style, timeStyle: style });
  }
  if (t === 'Boolean') return value;
  return value === null || value === undefined ? '' : value;
}

/* A Currency/Unit composite: [amount, code] -> "1,234.50 EUR". */
export function formatAmount(parts, typeName, formatOptions = {}, locale = undefined) {
  const [amount, code] = parts;
  if (amount === null || amount === undefined || amount === '') return '';
  const o = formatOptions || {};
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  const digits = shortType(typeName) === 'Currency' ? (o.decimals ?? 2) : o.decimals;
  const text = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits ?? 0,
    maximumFractionDigits: digits ?? 20,
    useGrouping: o.groupingEnabled !== false,
  }).format(n);
  return o.showMeasure === false || !code ? text : `${text} ${code}`;
}

/* Back from the control into the model: what the type's parseValue would
 * write - a number for the number types (the model keeps its JSON type), the
 * source pattern for a date type with a `source`, the text otherwise. */
export function parseValue(text, typeName, formatOptions = {}) {
  const t = shortType(typeName);
  const o = formatOptions || {};
  if (NUMBER_TYPES.has(t)) {
    const s = String(text ?? '').replace(/[\s ]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
    if (s === '') return t === 'Integer' || t === 'Float' ? 0 : null;
    const n = INTEGER_TYPES.has(t) ? parseInt(s, 10) : parseFloat(s.replace(',', '.'));
    return Number.isNaN(n) ? text : n;
  }
  if (DATE_TYPES.has(t) && o.source && o.source.pattern && o.pattern) {
    const d = parseDatePattern(text, o.pattern);
    return d ? formatDatePattern(d, o.source.pattern) : text;
  }
  return text;
}
