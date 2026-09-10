import { describe, expect, it } from "vitest";
import { potFractionAmount } from "@/lib/bet-sizing";

describe("pot shortcut sizing", () => {
  it("calculates common pot fractions", () => {
    expect(potFractionAmount(1200, 1, 4, 100, 5000)).toBe(300);
    expect(potFractionAmount(1200, 1, 3, 100, 5000)).toBe(400);
    expect(potFractionAmount(1200, 1, 2, 100, 5000)).toBe(600);
    expect(potFractionAmount(1200, 3, 4, 100, 5000)).toBe(900);
  });

  it("clamps shortcuts to legal minimum and stack maximum", () => {
    expect(potFractionAmount(100, 1, 4, 200, 5000)).toBe(200);
    expect(potFractionAmount(10_000, 3, 4, 100, 900)).toBe(900);
  });

  it("includes the call before sizing a raise", () => {
    expect(potFractionAmount(1200, 1, 2, 1200, 10_100, 600, 0)).toBe(1500);
    expect(potFractionAmount(1200, 3, 4, 1200, 10_100, 600, 0)).toBe(1950);
  });
});
