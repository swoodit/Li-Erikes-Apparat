export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidMoneyError extends RangeError {
  constructor(message = "Money minor units must be a non-negative integer") {
    super(message);
    this.name = new.target.name;
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(leftCurrency: string, rightCurrency: string) {
    super(`Cannot combine ${leftCurrency} and ${rightCurrency} amounts`);
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(state: PropertyKey, event: PropertyKey) {
    super(`Cannot apply ${String(event)} while in ${String(state)} state`);
  }
}
