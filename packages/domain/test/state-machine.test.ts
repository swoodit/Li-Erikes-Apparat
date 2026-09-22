import { describe, expect, it } from "vitest";
import {
  InvalidTransitionError,
  quoteTransitions,
  transition,
} from "../src/index";

describe("quote transitions", () => {
  it("moves a draft quote to approved", () => {
    expect(transition("draft", "approve", quoteTransitions)).toBe("approved");
  });

  it("rejects events that are not defined for the current state", () => {
    expect(() => transition("paid", "approve", quoteTransitions)).toThrow(
      InvalidTransitionError,
    );
  });

  it("keeps terminal states terminal", () => {
    expect(() => transition("cancelled", "cancel", quoteTransitions)).toThrow(
      InvalidTransitionError,
    );
  });
});
