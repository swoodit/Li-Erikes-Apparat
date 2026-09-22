import { InvalidTransitionError } from "./errors.js";

export type TransitionTable = Readonly<
  Record<PropertyKey, Readonly<Record<PropertyKey, PropertyKey>>>
>;

type NextState<Transitions, Event extends PropertyKey> =
  Transitions extends Record<Event, infer Next> ? Next : never;

export function transition<
  Table extends TransitionTable,
  State extends keyof Table,
  Event extends PropertyKey,
>(state: State, event: Event, table: Table): NextState<Table[State], Event> {
  const stateTransitions = table[state] as Readonly<
    Record<PropertyKey, PropertyKey>
  >;
  const nextState = stateTransitions?.[event];

  if (nextState === undefined) {
    throw new InvalidTransitionError(state, event);
  }

  return nextState as NextState<Table[State], Event>;
}

export const quoteTransitions = {
  draft: { approve: "approved", cancel: "cancelled" },
  approved: { requestPayment: "awaiting_payment", cancel: "cancelled" },
  awaiting_payment: { confirmPayment: "paid", cancel: "cancelled" },
  paid: {},
  cancelled: {},
} as const;
