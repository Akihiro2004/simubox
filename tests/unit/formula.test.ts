import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MathText } from "@/components/ui/formula";

const html = (src: string) => renderToStaticMarkup(createElement(MathText, { src }));

describe("MathText", () => {
  it("stacks fractions and typesets powers, functions and Greek letters", () => {
    const h = html("R = (v^2 * sin(2*theta)) / g");
    expect(h).toContain('class="frac');
    expect(h).toContain("<sup");
    expect(h).toContain("sin");
    expect(h).toContain("θ");
    expect(h).not.toContain("*");
    expect(h).not.toContain("^");
  });
  it("handles subscripts, roots and implicit products", () => {
    expect(html("v_0 = sqrt(2 g h)")).toContain("<sub");
    expect(html("v_0 = sqrt(2 g h)")).toContain("√");
    expect(html("E_k = 1/2 m v^2")).toContain('class="frac');
    expect(html("I = V / (R_1 + R_2)")).toContain('class="frac');
  });
  it("falls back to tidy text when it can't parse", () => {
    expect(html("a ? b * c^2")).toBe("a ? b · c²");
  });
});
