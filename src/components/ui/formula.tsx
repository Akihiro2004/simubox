// Renders the plain maths Gemini writes ("R = (v^2 * sin(2*theta)) / g") as
// typeset maths: stacked fractions, superscripts, subscripts, roots, Greek
// letters and italic variables. Anything it can't parse is shown tidied up.

import { Fragment, type ReactNode } from "react";

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", pi: "π",
  rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", omega: "ω", Omega: "Ω",
};
const FUNCS = new Set(["sin", "cos", "tan", "log", "ln", "exp", "sqrt", "abs"]);
const RELATIONS: Record<string, string> = { "=": "=", "≈": "≈", "<": "<", ">": ">", "<=": "≤", ">=": "≥", "≤": "≤", "≥": "≥", "!=": "≠", "≠": "≠" };

type Node =
  | { k: "num" | "sym" | "word"; v: string; sub?: string }
  | { k: "op"; v: string }
  | { k: "row"; items: Node[] }
  | { k: "frac"; num: Node; den: Node }
  | { k: "pow"; base: Node; exp: Node }
  | { k: "fn"; name: string; arg: Node }
  | { k: "paren"; inner: Node };

const TOKEN = /\s*(\d+(?:\.\d+)?|[A-Za-zΑ-ωΔΣΩ]+(?:_[A-Za-z0-9]+)?|<=|>=|!=|[=≈<>≤≥≠+\-−±*·×/^(),])/y;

function tokenize(src: string): string[] | null {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  const s = src.trim();
  while (TOKEN.lastIndex < s.length) {
    const m = TOKEN.exec(s);
    if (!m) return null;
    out.push(m[1]);
  }
  return out;
}

function parse(tokens: string[]): Node | null {
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  const atom = (): Node => {
    const t = next();
    if (t === undefined) throw new Error("end");
    if (t === "(") {
      const inner = expr();
      if (next() !== ")") throw new Error(")");
      return { k: "paren", inner };
    }
    if (/^\d/.test(t)) return { k: "num", v: t };
    if (/^[A-Za-zΑ-ωΔΣΩ]/.test(t)) {
      const [name, sub] = t.split("_");
      if (FUNCS.has(name) && peek() === "(") {
        next();
        const arg = expr();
        if (next() !== ")") throw new Error(")");
        return { k: "fn", name, arg };
      }
      const greek = GREEK[name];
      if (greek) return { k: "sym", v: greek, sub };
      return name.length === 1 || sub ? { k: "sym", v: name, sub } : { k: "word", v: name };
    }
    throw new Error(`unexpected ${t}`);
  };
  const power = (): Node => {
    const base = atom();
    if (peek() !== "^") return base;
    next();
    const neg = peek() === "-" || peek() === "−" ? (next(), true) : false;
    const e = atom();
    const exp: Node = e.k === "paren" ? e.inner : e;
    return { k: "pow", base, exp: neg ? { k: "row", items: [{ k: "op", v: "−" }, exp] } : exp };
  };
  const unary = (): Node => {
    if (peek() === "-" || peek() === "−") {
      next();
      return { k: "row", items: [{ k: "op", v: "−" }, unary()] };
    }
    return power();
  };
  const term = (): Node => {
    let items: Node[] = [unary()];
    for (;;) {
      const t = peek();
      if (t === "*" || t === "·" || t === "×") {
        next();
        const rhs = unary();
        const prev = items[items.length - 1];
        // Show × between numbers; juxtapose otherwise (2θ, mgh, v² sin θ).
        if (prev.k === "num" && rhs.k === "num") items.push({ k: "op", v: "×" });
        items.push(rhs);
      } else if (t === "/") {
        next();
        const den = unary();
        const num: Node = items.length === 1 ? items[0] : { k: "row", items };
        items = [{ k: "frac", num: num.k === "paren" ? num.inner : num, den: den.k === "paren" ? den.inner : den }];
      } else if (t !== undefined && (t === "(" || /^[A-Za-z0-9ΑΔΣΩα-ω]/.test(t))) {
        items.push(unary()); // implicit multiplication: 2x, 1/2 m v^2
      } else break;
    }
    return items.length === 1 ? items[0] : { k: "row", items };
  };
  const expr = (): Node => {
    const items: Node[] = [term()];
    for (;;) {
      const t = peek();
      if (t === "+" || t === "-" || t === "−" || t === "±") {
        next();
        items.push({ k: "op", v: t === "-" ? "−" : t }, term());
      } else break;
    }
    return items.length === 1 ? items[0] : { k: "row", items };
  };
  const equation = (): Node => {
    const items: Node[] = [expr()];
    while (peek() !== undefined && peek() in RELATIONS) {
      items.push({ k: "op", v: RELATIONS[next()] }, expr());
    }
    return items.length === 1 ? items[0] : { k: "row", items };
  };
  try {
    const n = equation();
    return i === tokens.length ? n : null;
  } catch {
    return null;
  }
}

function render(n: Node, key?: number): ReactNode {
  switch (n.k) {
    case "num":
      return <span key={key}>{n.v}</span>;
    case "sym":
      return (
        <span key={key} className="italic">
          {n.v}
          {n.sub && <sub className="not-italic text-[0.62em]">{GREEK[n.sub] ?? n.sub}</sub>}
        </span>
      );
    case "word":
      return <span key={key}>{n.v}</span>;
    case "op":
      return (
        <span key={key} className="px-[0.22em]">
          {n.v}
        </span>
      );
    case "row":
      return (
        <span key={key} className="inline-flex items-center gap-[0.12em]">
          {n.items.map((c, i) => render(c, i))}
        </span>
      );
    case "paren":
      return <span key={key}>({render(n.inner)})</span>;
    case "frac":
      return (
        <span key={key} className="frac mx-[0.15em] inline-flex flex-col items-center align-middle text-[0.86em] leading-[1.15]">
          <span className="px-[0.2em] pb-[0.1em]">{render(n.num)}</span>
          <span className="border-t-[1.5px] border-current px-[0.2em] pt-[0.1em]">{render(n.den)}</span>
        </span>
      );
    case "pow":
      return (
        <span key={key}>
          {render(n.base)}
          <sup className="text-[0.62em]">{render(n.exp)}</sup>
        </span>
      );
    case "fn":
      if (n.name === "sqrt")
        return (
          <span key={key} className="inline-flex items-start">
            √<span className="border-t-[1.5px] border-current pl-[0.1em]">{render(n.arg)}</span>
          </span>
        );
      if (n.name === "abs")
        return (
          <span key={key}>
            |{render(n.arg)}|
          </span>
        );
      return (
        <span key={key}>
          {n.name}
          {n.arg.k === "sym" || n.arg.k === "num" ? <span className="pl-[0.15em]">{render(n.arg)}</span> : <>({render(n.arg)})</>}
        </span>
      );
  }
}

/** Readable fallback for text the parser doesn't accept. */
function tidy(src: string): string {
  return src
    .replace(/\b([A-Za-z]+)\b/g, (w) => GREEK[w] ?? w)
    .replace(/\^2\b/g, "²")
    .replace(/\^3\b/g, "³")
    .replace(/\s*\*\s*/g, " · ")
    .replace(/sqrt/g, "√");
}

export function MathText({ src }: { src: string }) {
  const tokens = tokenize(src);
  const tree = tokens && parse(tokens);
  return tree ? <span className="math inline-flex flex-wrap items-center">{render(tree)}</span> : <Fragment>{tidy(src)}</Fragment>;
}
