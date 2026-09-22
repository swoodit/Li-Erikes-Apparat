import { describe, expect, it } from "vitest";
import { addMoney, CurrencyMismatchError, money, sek } from "../src/index";

describe("money", () => {
  it("adds same-currency minor units without mutating either amount", () => {
    const first = money("SEK", 1000);
    const second = money("SEK", 250);

    expect(addMoney(first, second)).toEqual({ currency: "SEK", minor: 1250 });
    expect(first).toEqual({ currency: "SEK", minor: 1000 });
    expect(second).toEqual({ currency: "SEK", minor: 250 });
  });

  it("rejects amounts with different currencies", () => {
    expect(() => addMoney(sek(1), { currency: "EUR", minor: 1 })).toThrow(
      CurrencyMismatchError,
    );
  });

  it("rejects negative and non-integer minor units", () => {
    expect(() => money("SEK", -1)).toThrow(RangeError);
    expect(() => money("SEK", 1.5)).toThrow(RangeError);
  });
});
