// A tiny, safe maths expression parser for plotting y = f(x).
// No eval, no property access: only numbers, x, constants, + - * / ^,
// parentheses, implicit multiplication (2x, 3(x+1)) and a fixed function list.

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};
const CONSTS: Record<string, number> = { pi: Math.PI, "π": Math.PI, e: Math.E };

export const MAX_EXPR_LENGTH = 100;

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };
type Node = (x: number) => number;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new SyntaxError(`bad number at ${i}`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-zA-Zπ]/.test(c)) {
      const m = /^([a-zA-Z]+|π)/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
    } else if ("+-*/^()".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
    } else if (c === "×" || c === "·") {
      out.push({ t: "op", v: "*" });
      i++;
    } else {
      throw new SyntaxError(`unexpected "${c}"`);
    }
  }
  return out;
}

/** Compile an expression in x to a function. Throws SyntaxError on bad input. */
export function compileExpression(src: string): (x: number) => number {
  if (src.length > MAX_EXPR_LENGTH) throw new SyntaxError("expression too long");
  const toks = tokenize(src.replace(/^\s*y\s*=\s*/i, ""));
  if (!toks.length) throw new SyntaxError("empty expression");
  if (toks.length > 80) throw new SyntaxError("expression too long");
  let pos = 0;
  let depth = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new SyntaxError(`expected "${v}"`);
    pos++;
  };
  // Can the next token start a factor? (for implicit multiplication)
  const startsFactor = () => {
    const p = peek();
    return !!p && (p.t === "num" || p.t === "id" || (p.t === "op" && p.v === "("));
  };

  function expr(): Node {
    if (++depth > 40) throw new SyntaxError("too deeply nested");
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = toks[pos++].v;
      const a = left, b = term();
      left = op === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    depth--;
    return left;
  }
  function term(): Node {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = toks[pos++].v;
        const a = left, b = unary();
        left = op === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (startsFactor()) {
        const a = left, b = power();
        left = (x) => a(x) * b(x);
      } else return left;
    }
  }
  function unary(): Node {
    if (isOp("-")) {
      pos++;
      const a = unary();
      return (x) => -a(x);
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return power();
  }
  function power(): Node {
    const base = primary();
    if (isOp("^")) {
      pos++;
      const exp = unary();
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }
  function primary(): Node {
    const p = peek();
    if (!p) throw new SyntaxError("unexpected end");
    if (p.t === "num") {
      pos++;
      const v = p.v;
      return () => v;
    }
    if (p.t === "id") {
      pos++;
      if (p.v === "x") return (x) => x;
      if (Object.hasOwn(CONSTS, p.v)) {
        const v = CONSTS[p.v];
        return () => v;
      }
      if (Object.hasOwn(FUNCS, p.v)) {
        const f = FUNCS[p.v];
        expect("(");
        const a = expr();
        expect(")");
        return (x) => f(a(x));
      }
      throw new SyntaxError(`unknown name "${p.v}"`);
    }
    if (isOp("(")) {
      pos++;
      const a = expr();
      expect(")");
      return a;
    }
    throw new SyntaxError(`unexpected "${p.v}"`);
  }

  const fn = expr();
  if (pos !== toks.length) throw new SyntaxError(`unexpected "${toks[pos].v}"`);
  return fn;
}

export function isValidExpression(src: string): boolean {
  try {
    compileExpression(src);
    return true;
  } catch {
    return false;
  }
}

/** Sample y = f(x); non-finite results break the line (e.g. tan, 1/x). */
export function sampleExpression(f: (x: number) => number, xMin: number, xMax: number, n = 200): ([number, number] | null)[] {
  const pts: ([number, number] | null)[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    const y = f(x);
    pts.push(Number.isFinite(y) ? [x, y] : null);
  }
  return pts;
}
