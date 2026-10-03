/*
 * Expression bindings (`{= ${/QUANTITY} > 500 }`) - the grammar of portable
 * profile v1, section 4: `${path}` references (absolute, relative, model
 * prefixed), string/number/boolean/null/undefined literals, `!` and unary
 * `-`/`+`, `* / %`, `+ -`, `< <= > >=`, `=== !== == !=`, `&&`, `||`, `? :`,
 * parentheses, `.length`, `Math.max/min/abs/round/floor/ceil`, and the
 * string methods `toUpperCase/toLowerCase/trim/indexOf/includes/startsWith/
 * endsWith`.
 *
 * It is the vendored viewxml.mjs evalExpression's grammar plus the
 * functions the profile adds - a superset, so it lives here and the
 * vendored copy stays untouched. Parsed ONCE into a tree (compileExpression
 * throws with the reason for anything outside the grammar - RegExp(),
 * odata.*, encodeURIComponent, ...), evaluated per binding context. No
 * eval, no Function: the view XML is backend data.
 */

const MATH = { max: Math.max, min: Math.min, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil };
const STRING_METHODS = new Set(['toUpperCase', 'toLowerCase', 'trim', 'indexOf', 'includes', 'startsWith', 'endsWith']);

function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '$' && s[i + 1] === '{') {
      const end = s.indexOf('}', i);
      if (end < 0) throw new Error('unterminated ${');
      const body = s.slice(i + 2, end).trim();
      const p = /^path\s*:\s*(['"])(.*?)\1/.exec(body);
      out.push({ t: 'ref', v: p ? p[2] : body });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
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
      if (j >= s.length) throw new Error('unterminated string');
      out.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) {
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
    const three = s.slice(i, i + 3);
    const two = s.slice(i, i + 2);
    if (three === '===' || three === '!==') {
      out.push({ t: 'op', v: three });
      i += 3;
      continue;
    }
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('<>+-*/%!?:().,'.includes(c)) {
      out.push({ t: 'op', v: c });
      i += 1;
      continue;
    }
    throw new Error(`character '${c}'`);
  }
  return out;
}

const LEVELS = [['||'], ['&&'], ['===', '!==', '==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];

/** Parse an expression body into a tree; throws Error(reason) outside the grammar. */
export function compileExpression(src) {
  const tokens = tokenize(String(src));
  let pos = 0;
  const peek = (v) => tokens[pos] && tokens[pos].t === 'op' && (v === undefined || tokens[pos].v === v);
  const expect = (v) => {
    if (!peek(v)) throw new Error(`'${v}' expected`);
    pos += 1;
  };
  const args = () => {
    expect('(');
    const list = [];
    while (!peek(')')) {
      list.push(ternary());
      if (peek(',')) pos += 1;
      else break;
    }
    expect(')');
    return list;
  };
  const primary = () => {
    const t = tokens[pos++];
    if (!t) throw new Error('unexpected end');
    if (t.t === 'ref') return { k: 'ref', v: t.v };
    if (t.t === 'str' || t.t === 'num') return { k: 'lit', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') return { k: 'lit', v: t.v === 'true' };
      if (t.v === 'null') return { k: 'lit', v: null };
      if (t.v === 'undefined') return { k: 'lit', v: undefined };
      if (t.v === 'Math' && peek('.')) {
        pos += 1;
        const fn = tokens[pos++];
        if (!fn || fn.t !== 'id' || !MATH[fn.v]) throw new Error(`Math.${fn ? fn.v : ''} is not in the profile`);
        return { k: 'math', fn: fn.v, args: args() };
      }
      throw new Error(`'${t.v}' is not in the profile`);
    }
    if (t.v === '(') {
      const e = ternary();
      expect(')');
      return e;
    }
    if (t.v === '!') return { k: 'not', e: postfix() };
    if (t.v === '-') return { k: 'neg', e: postfix() };
    if (t.v === '+') return { k: 'pos', e: postfix() };
    throw new Error(`unexpected '${t.v}'`);
  };
  const postfix = () => {
    let e = primary();
    while (peek('.')) {
      pos += 1;
      const name = tokens[pos++];
      if (!name || name.t !== 'id') throw new Error('member name expected');
      if (name.v === 'length' && !peek('(')) {
        e = { k: 'len', e };
      } else if (STRING_METHODS.has(name.v) && peek('(')) {
        e = { k: 'call', e, fn: name.v, args: args() };
      } else {
        throw new Error(`.${name.v} is not in the profile`);
      }
    }
    return e;
  };
  const binary = (level) => {
    if (level >= LEVELS.length) return postfix();
    let left = binary(level + 1);
    while (tokens[pos] && tokens[pos].t === 'op' && LEVELS[level].includes(tokens[pos].v)) {
      const op = tokens[pos++].v;
      left = { k: 'bin', op, a: left, b: binary(level + 1) };
    }
    return left;
  };
  const ternary = () => {
    const c = binary(0);
    if (peek('?')) {
      pos += 1;
      const a = ternary();
      expect(':');
      return { k: 'if', c, a, b: ternary() };
    }
    return c;
  };
  const tree = ternary();
  if (pos !== tokens.length) throw new Error(`unexpected '${tokens[pos].v}'`);
  return tree;
}

function bin(op, a, b) {
  switch (op) {
    case '||': return a || b;
    case '&&': return a && b;
    case '==': return a == b;
    case '!=': return a != b;
    case '===': return a === b;
    case '!==': return a !== b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '%': return a % b;
    default: return undefined;
  }
}

/** Evaluate a compiled tree; `get(ref)` answers `${ref}`. */
export function evaluate(tree, get) {
  const ev = (n) => {
    switch (n.k) {
      case 'lit': return n.v;
      case 'ref': return get(n.v);
      case 'not': return !ev(n.e);
      case 'neg': return -ev(n.e);
      case 'pos': return +ev(n.e);
      case 'len': {
        const v = ev(n.e);
        return v === null || v === undefined ? undefined : v.length;
      }
      case 'call': {
        const v = ev(n.e);
        if (v === null || v === undefined) return undefined;
        return String(v)[n.fn](...n.args.map(ev));
      }
      case 'math': return MATH[n.fn](...n.args.map((a) => Number(ev(a))));
      case 'bin':
        if (n.op === '&&') return ev(n.a) && ev(n.b);
        if (n.op === '||') return ev(n.a) || ev(n.b);
        return bin(n.op, ev(n.a), ev(n.b));
      case 'if': return ev(n.c) ? ev(n.a) : ev(n.b);
      default: return undefined;
    }
  };
  try {
    return ev(tree);
  } catch {
    return undefined;
  }
}
