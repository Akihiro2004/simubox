import { compileExpression } from "./expr";
import { mathSetupError, SCHOOL_UNITS, type MathState } from "../experiments";

export const mathNumber = (n: number) => Number(n.toPrecision(8)).toString();
const snapTrig = (n: number) => Math.abs(n) < 1e-12 ? 0 : Math.abs(n - 1) < 1e-12 ? 1 : Math.abs(n + 1) < 1e-12 ? -1 : n;
const f = mathNumber;
export interface MathResult {
  title: string; formula: string; answer: string; steps: string[];
  values: { label: string; value: number }[];
  points: [number, number][];
}
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a);
export function fraction(n: number, d: number): string {
  if (!d) return "undefined";
  const sign = d < 0 ? -1 : 1, common = gcd(n, d) || 1;
  n = n / common * sign; d = Math.abs(d / common);
  return d === 1 ? String(n) : `${n}/${d}`;
}
export function schoolMath(s: MathState): MathResult {
  const r: MathResult = { title: "Math investigation", formula: "", answer: "", steps: [], values: [], points: [] };
  const error = mathSetupError(s);
  if (error) return { ...r, answer: error };
  const { a, b, c } = s;
  const answer = (value: number | null) => value === null || !Number.isFinite(value) ? "Undefined" : f(value);
  if (s.mode === "number_line" || s.mode === "arithmetic") {
    r.title = s.mode === "number_line" ? "Numbers on a line" : "Arithmetic workshop";
    const symbols = { add: "+", subtract: "−", multiply: "×", divide: "÷", power: "^" };
    const value = s.operation === "add" ? a + b : s.operation === "subtract" ? a - b : s.operation === "multiply" ? a * b : s.operation === "divide" ? (b ? a / b : null) : (a === 0 && b <= 0 ? null : a ** b);
    r.formula = `${f(a)} ${symbols[s.operation]} (${f(b)})`;
    r.answer = answer(value);
    r.steps = value === null ? ["Division by zero and zero to a non-positive power are undefined in this model."] : [`Start with ${f(a)}.`, `${symbols[s.operation]} (${f(b)}) gives ${r.answer}.`];
    r.values = [{ label: "a", value: a }, { label: "b", value: b }, ...(value === null ? [] : [{ label: "result", value }])];
    r.points = [[0, 0], [a, 0], ...(value === null ? [] : [[value, 0] as [number, number]])];
  } else if (s.mode === "place_value") {
    const rounded = Math.abs(a).toFixed(3), [whole, decimal] = rounded.split(".");
    const digits = whole.split("").map((digit, i) => ({ label: `10^${whole.length - i - 1}`, value: Number(digit) * 10 ** (whole.length - i - 1) }));
    for (let i = 0; i < decimal.length; i++) if (Number(decimal[i])) digits.push({ label: `10^${-i - 1}`, value: Number(decimal[i]) * 10 ** (-i - 1) });
    r.title = "Place-value blocks"; r.formula = "digit × place value; each place is ten times the next";
    r.answer = `${a < 0 ? "−(" : ""}${digits.filter(d => d.value !== 0).map(d => f(d.value)).join(" + ") || "0"}${a < 0 ? ")" : ""}`;
    r.steps = [`Read ${f(a)} by thousands, hundreds, tens, ones, tenths, hundredths and thousandths.`, "Decimal display is rounded to three places. The minus sign applies to the whole number."];
    r.values = digits;
  } else if (s.mode === "measurement") {
    const from = SCHOOL_UNITS[s.unitFrom], to = SCHOOL_UNITS[s.unitTo];
    const value = a * from[1] / to[1];
    r.title = "Measurement conversion"; r.formula = "quantity × source scale ÷ target scale";
    r.answer = `${f(a)} ${s.unitFrom} = ${f(value)} ${s.unitTo}`;
    r.steps = [`Both units measure ${from[0]}.`, `Multiply by ${f(from[1] / to[1])}.`, "The quantity stays the same; the number changes with the unit."];
    r.values = [{ label: s.unitFrom, value: a }, { label: s.unitTo, value }];
  } else if (s.mode === "angles") {
    const theta = ((s.angleDeg % 360) + 360) % 360;
    const kind = theta === 0 ? "zero angle" : theta < 90 ? "acute" : theta === 90 ? "right" : theta < 180 ? "obtuse" : theta === 180 ? "straight" : "reflex";
    r.title = "Angle explorer"; r.formula = "Full turn = 360°; straight angle = 180°; right angle = 90°";
    r.answer = `${f(theta)}°: ${kind}`;
    r.steps = [`Signed input ${f(s.angleDeg)}° is coterminal with ${f(theta)}°.`, theta <= 90 ? `Complement = ${f(90 - theta)}°.` : "No nonnegative complement.", theta <= 180 ? `Supplement = ${f(180 - theta)}°.` : "No nonnegative supplement."];
    const radians = theta * Math.PI / 180;
    r.points = [[1, 0], [0, 0], [snapTrig(Math.cos(radians)), snapTrig(Math.sin(radians))]];
  } else if (s.mode === "fractions") {
    const n = s.numerator, d = s.denominator, n2 = s.numerator2, d2 = s.denominator2;
    const pair = s.operation === "subtract" ? [n * d2 - n2 * d, d * d2] : s.operation === "multiply" ? [n * n2, d * d2] : s.operation === "divide" ? [n * d2, d * n2] : [n * d2 + n2 * d, d * d2];
    r.title = "Fraction strips"; r.formula = `${n}/${d} ${s.operation === "subtract" ? "−" : s.operation === "multiply" ? "×" : s.operation === "divide" ? "÷" : "+"} ${n2}/${d2}`;
    r.answer = fraction(pair[0], pair[1]);
    r.steps = [s.operation === "add" || s.operation === "subtract" ? `Use denominator ${d * d2}: ${n * d2}/${d * d2} and ${n2 * d}/${d * d2}.` : s.operation === "divide" ? "Multiply by the reciprocal of the second fraction. Zero has no reciprocal." : "Multiply numerators and denominators.", `Simplify ${pair[0]}/${pair[1]} to ${r.answer}.`];
    r.values = [{ label: `${n}/${d}`, value: n / d }, { label: `${n2}/${d2}`, value: n2 / d2 }];
  } else if (s.mode === "ratio" || s.mode === "percent") {
    r.title = s.mode === "ratio" ? "Ratio table" : "Percent of a whole";
    const value = s.mode === "ratio" ? (a ? b * c / a : null) : a * b / 100;
    r.formula = s.mode === "ratio" ? `${f(a)} : ${f(b)} = ${f(c)} : x` : `${f(b)}% of ${f(a)}`;
    r.answer = answer(value);
    r.steps = s.mode === "ratio" ? [`Multiply both parts by ${a ? f(c / a) : "an undefined scale factor"}.`, `x = ${f(b)} × ${f(c)} ÷ ${f(a)} = ${r.answer}.`] : [`${f(b)}% = ${f(b / 100)}.`, `Multiply by the whole: ${r.answer}.`];
    r.values = [{ label: "whole / first part", value: a }, { label: "second part", value: b }, ...(value === null ? [] : [{ label: "result", value }])];
  } else if (s.mode === "equation" || s.mode === "inequality") {
    r.title = s.mode === "equation" ? "Equation balance" : "Inequality number line";
    r.formula = `${f(a)}x + (${f(b)}) ${s.mode === "equation" ? "=" : "≤"} ${f(c)}`;
    if (!a) r.answer = (s.mode === "equation" ? b === c : b <= c) ? "All real numbers" : "No solution";
    else {
      const x = (c - b) / a;
      r.answer = `x ${s.mode === "equation" ? "=" : a < 0 ? "≥" : "≤"} ${f(x)}`;
      r.values = [{ label: "boundary / solution", value: x }]; r.points = [[x, 0]];
    }
    r.steps = [`Subtract ${f(b)} from both sides.`, a ? `Divide both sides by ${f(a)}.${s.mode === "inequality" && a < 0 ? " Reverse the inequality because the divisor is negative." : ""}` : "The variable term is zero; check whether the remaining statement is true."];
  } else if (s.mode === "quadratic") {
    r.title = "Quadratic roots"; r.formula = `${f(a)}x² + (${f(b)})x + (${f(c)}) = 0`;
    const disc = b * b - 4 * a * c;
    if (!a) r.answer = b ? `x = ${f(-c / b)}` : c === 0 ? "All real numbers" : "No solution";
    else if (disc < 0) r.answer = `x = ${f(-b / (2 * a))} ± ${f(Math.sqrt(-disc) / (2 * Math.abs(a)))}i`;
    else {
      // Stable root calculation avoids subtracting nearly equal large numbers.
      const q = -.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(disc));
      const roots = q === 0 ? [0, 0] : [q / a, c / q];
      r.answer = disc === 0 ? `x = ${f(roots[0])} (repeated)` : `x = ${f(roots[0])} or ${f(roots[1])}`;
      r.points = roots.map(x => [x, 0]);
    }
    r.steps = a ? [`Discriminant b² − 4ac = ${f(disc)}.`, "x = (−b ± √(b² − 4ac)) / (2a).", disc < 0 ? "Negative discriminant: two complex roots, no real x-intercepts." : r.answer] : ["The x² coefficient is zero; solve the remaining linear equation."];
    r.values = [{ label: "discriminant", value: disc }];
  } else if (s.mode === "linear_system") {
    const [a, b, c, d, e, f2] = s.coefficients, det = a * e - b * d;
    r.title = "Two-equation intersection"; r.formula = `${f(a)}x + ${f(b)}y = ${f(c)}; ${f(d)}x + ${f(e)}y = ${f(f2)}`;
    if (!det) {
      const inconsistentZero = (a === 0 && b === 0 && c !== 0) || (d === 0 && e === 0 && f2 !== 0);
      r.answer = !inconsistentZero && a * f2 === c * d && b * f2 === c * e ? "Infinitely many solutions" : "No solution";
    } else {
      const x = (c * e - b * f2) / det, y = (a * f2 - c * d) / det;
      r.answer = `(x, y) = (${f(x)}, ${f(y)})`; r.points = [[x, y]];
    }
    r.steps = [`Determinant ae − bd = ${f(det)}.`, det ? "Eliminate one variable, solve it, then substitute back." : "Check whether the equations describe the same constraint or incompatible constraints."];
  } else if (s.mode === "functions") {
    r.title = "Function machine"; r.formula = `y = ${s.expression}`;
    const fn = compileExpression(s.expression), y = fn(a);
    r.answer = `f(${f(a)}) = ${answer(y)}`;
    r.steps = ["Read x horizontally and y vertically on the graph.", `Substitute x = ${f(a)}.`, "Breaks in the curve mark undefined or off-board values; angles in functions are radians."];
    if (y !== null && Number.isFinite(y)) r.points = [[a, y]];
  } else if (s.mode === "geometry") {
    const w = s.width, h = s.height, d = s.depth, radius = w / 2;
    r.title = "Geometry worktable";
    const area = s.shape === "rectangle" ? w * h : s.shape === "triangle" ? w * h / 2 : Math.PI * radius ** 2;
    const volume = s.shape === "cuboid" ? w * h * d : s.shape === "cylinder" ? Math.PI * radius ** 2 * h : 4 / 3 * Math.PI * radius ** 3;
    const is3d = ["cuboid", "cylinder", "sphere"].includes(s.shape);
    r.formula = ({ rectangle: "A = width × height", triangle: "A = base × perpendicular height / 2", circle: "A = πr²", cuboid: "V = width × height × depth", cylinder: "V = πr²h", sphere: "V = 4πr³/3" })[s.shape];
    r.answer = `${f(is3d ? volume : area)} units${is3d ? "³" : "²"}`;
    r.values = [{ label: is3d ? "volume" : "area", value: is3d ? volume : area }];
    r.steps = [`Width / diameter = ${f(w)}; perpendicular height = ${f(h)}; depth = ${f(d)}.`, "For circles, cylinders and spheres, radius is half the diameter.", r.formula + " = " + r.answer];
    const boundary = s.shape === "rectangle" ? 2 * (w + h) : s.shape === "triangle" ? w + h + Math.hypot(w, h) : s.shape === "circle" ? Math.PI * w : s.shape === "cuboid" ? 2 * (w * h + w * d + h * d) : s.shape === "cylinder" ? 2 * Math.PI * radius * (radius + h) : 4 * Math.PI * radius ** 2;
    r.steps.push(`${is3d ? "Surface area" : s.shape === "circle" ? "Circumference" : "Perimeter"}: ${f(boundary)} units${is3d ? "²" : ""}.${s.shape === "triangle" ? " This instrument uses a right triangle." : ""}`);
  } else if (s.mode === "trigonometry") {
    const angle = s.angleDeg * Math.PI / 180, sin = snapTrig(Math.sin(angle)), cos = snapTrig(Math.cos(angle));
    r.title = "Unit circle"; r.formula = "(x, y) = (cos θ, sin θ)";
    r.answer = `sin θ = ${f(sin)}; cos θ = ${f(cos)}; tan θ = ${Math.abs(cos) < 1e-10 ? "undefined" : f(sin / cos)}`;
    r.steps = [`θ = ${f(s.angleDeg)}° = ${f(angle)} radians.`, "On the unit circle, x = cos θ and y = sin θ.", "tan θ = sin θ / cos θ, except where cos θ = 0."];
    r.points = [[0, 0], [cos, 0], [cos, sin]];
  } else if (s.mode === "statistics") {
    const data = [...s.data].sort((a, b) => a - b), count = data.length, mean = data.reduce((a, b) => a + b, 0) / count;
    const median = count % 2 ? data[(count - 1) / 2] : (data[count / 2 - 1] + data[count / 2]) / 2;
    const variance = data.reduce((sum, x) => sum + (x - mean) ** 2, 0) / count;
    r.title = "Data desk"; r.formula = "mean = sum / count; population σ² = Σ(x − mean)² / count";
    r.answer = `Mean ${f(mean)}; median ${f(median)}; population σ ${f(Math.sqrt(variance))}`;
    r.steps = [`Sort: ${data.map(f).join(", ")}.`, `Add the ${count} values and divide by ${count}.`, "The median is the middle value (or mean of the middle pair). Population variance divides by n, not n−1."];
    const counts = new Map<number, number>(); for (const x of data) counts.set(x, (counts.get(x) ?? 0) + 1);
    const peak = Math.max(...counts.values()), modes = [...counts].filter(([, n]) => n === peak).map(([x]) => f(x));
    r.steps.push(`Range = ${f(data.at(-1)! - data[0])}. ${peak === 1 ? "No repeated mode." : `Mode(s): ${modes.join(", ")}.`}`);
    r.values = s.data.map((value, i) => ({ label: String(i + 1), value }));
  } else if (s.mode === "probability") {
    let probability = 1;
    const terms: string[] = [];
    for (let i = 0; i < s.draws; i++) {
      const top = Math.max(0, s.favourable - (s.replacement ? 0 : i)), bottom = s.total - (s.replacement ? 0 : i);
      probability *= top / bottom; terms.push(`${top}/${bottom}`);
    }
    r.title = "Probability counts"; r.formula = "P(all draws favourable) = product of conditional probabilities";
    r.answer = `${f(probability * 100)}%`;
    r.steps = [s.replacement ? "Replace each draw: the probabilities stay the same." : "Do not replace: update the counts after each successful draw.", terms.join(" × ") + " = " + r.answer, "This is the probability that ALL draws are favourable, not at least one."];
    r.values = [{ label: "favourable", value: s.favourable }, { label: "other", value: s.total - s.favourable }];
  } else if (s.mode === "sequence") {
    const value = s.sequence === "arithmetic" ? a + (s.index - 1) * b : a * b ** (s.index - 1);
    r.title = "Sequence steps"; r.formula = s.sequence === "arithmetic" ? "aₙ = a₁ + (n−1)d" : "aₙ = a₁ × r^(n−1)";
    r.answer = `Term ${s.index}: ${f(value)}`;
    r.steps = [`First term = ${f(a)}; ${s.sequence === "arithmetic" ? "difference" : "ratio"} = ${f(b)}.`, `Use n = ${s.index} in the formula.`];
    r.values = Array.from({ length: Math.min(s.index, 12) }, (_, i) => ({ label: String(i + 1), value: s.sequence === "arithmetic" ? a + i * b : a * b ** i }));
  } else {
    const angle = s.angleDeg * Math.PI / 180;
    const [x, y] = s.transform === "translate" ? [a + c, b + s.d] : s.transform === "reflect_x" ? [a, -b] : s.transform === "reflect_y" ? [-a, b] : [a * Math.cos(angle) - b * Math.sin(angle), a * Math.sin(angle) + b * Math.cos(angle)];
    r.title = "Coordinate transformations"; r.formula = s.transform === "rotate" ? "x′ = x cos θ − y sin θ; y′ = x sin θ + y cos θ" : s.transform === "translate" ? "(x′, y′) = (x + dx, y + dy)" : s.transform === "reflect_x" ? "(x′, y′) = (x, −y)" : "(x′, y′) = (−x, y)";
    r.answer = `(${f(a)}, ${f(b)}) → (${f(s.transform === "rotate" ? snapTrig(x) : x)}, ${f(s.transform === "rotate" ? snapTrig(y) : y)})`;
    r.steps = ["Rotations are counterclockwise about the origin; reflections are across the named axis.", r.formula];
    r.points = [[a, b], [s.transform === "rotate" ? snapTrig(x) : x, s.transform === "rotate" ? snapTrig(y) : y]];
  }
  return r;
}
