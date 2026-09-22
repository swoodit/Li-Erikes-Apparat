import { CurrencyMismatchError, InvalidMoneyError } from "./errors";

export type Money<C extends string = string> = Readonly<{
  currency: C;
  minor: number;
}>;

function assertValidMoney<C extends string>(value: Money<C>): void {
  if (
    typeof value.currency !== "string" ||
    value.currency.length === 0 ||
    !Number.isSafeInteger(value.minor) ||
    value.minor < 0
  ) {
    throw new InvalidMoneyError();
  }
}

export function money<C extends string>(currency: C, minor: number): Money<C> {
  const value = { currency, minor } as Money<C>;
  assertValidMoney(value);
  return Object.freeze(value);
}

export const makeMoney = money;

export function sek(minor: number): Money<"SEK"> {
  return money("SEK", minor);
}

export function addMoney<
  LeftCurrency extends string,
  RightCurrency extends string,
>(left: Money<LeftCurrency>, right: Money<RightCurrency>): Money<LeftCurrency> {
  assertValidMoney(left);
  assertValidMoney(right);

  if ((left.currency as string) !== (right.currency as string)) {
    throw new CurrencyMismatchError(left.currency, right.currency);
  }

  return money(left.currency, left.minor + right.minor);
}
