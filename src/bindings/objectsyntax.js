/*
 * The object syntax of a UI5 binding - `{ path: '/X', type: 'sap.ui.model.type.Date',
 * formatOptions: { pattern: 'dd.MM.yyyy' }, parts: [ ... ] }` - read as data.
 *
 * A relaxed JavaScript object literal: unquoted or quoted keys, single- or
 * double-quoted strings, numbers, true/false/null, nested objects and
 * arrays. Nothing is evaluated: a value that is no literal (a function
 * reference such as `formatter: '.myFormatter'` is a string, which is fine;
 * a bare identifier like `formatter: myFn`) is kept as { $ident: 'myFn' }.
 * Throws on anything it cannot read - callers treat that as "unsupported".
 */
export function parseObjectLiteral(src) {
  const s = String(src);
  let i = 0;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i += 1;
  };
  const fail = (what) => {
    throw new Error(`object syntax: ${what} at ${i} in ${s.slice(0, 80)}`);
  };
  const str = () => {
    const q = s[i];
    i += 1;
    let out = '';
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') {
        const e = s[i + 1];
        out += { n: '\n', t: '\t', r: '\r' }[e] ?? e;
        i += 2;
        continue;
      }
      out += s[i];
      i += 1;
    }
    if (i >= s.length) fail('unterminated string');
    i += 1;
    return out;
  };
  const ident = () => {
    const m = /^[A-Za-z_$][\w$.]*/.exec(s.slice(i));
    if (!m) fail('identifier expected');
    i += m[0].length;
    return m[0];
  };
  const value = () => {
    ws();
    const c = s[i];
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (c === '"' || c === "'") return str();
    const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const id = ident();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'null') return null;
    if (id === 'undefined') return undefined;
    return { $ident: id };
  };
  const obj = () => {
    i += 1;
    const out = {};
    for (;;) {
      ws();
      if (s[i] === '}') {
        i += 1;
        return out;
      }
      const key = s[i] === '"' || s[i] === "'" ? str() : ident();
      ws();
      if (s[i] !== ':') fail("':' expected");
      i += 1;
      out[key] = value();
      ws();
      if (s[i] === ',') i += 1;
      else if (s[i] !== '}') fail("',' or '}' expected");
    }
  };
  const arr = () => {
    i += 1;
    const out = [];
    for (;;) {
      ws();
      if (s[i] === ']') {
        i += 1;
        return out;
      }
      out.push(value());
      ws();
      if (s[i] === ',') i += 1;
      else if (s[i] !== ']') fail("',' or ']' expected");
    }
  };
  ws();
  const body = s[i] === '{' ? s : `{${s}}`;
  if (body !== s) return parseObjectLiteral(body);
  const v = obj();
  ws();
  if (i < s.length) fail('trailing characters');
  return v;
}
