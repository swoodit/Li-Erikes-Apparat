export type Clock = () => Date;
export type IdFactory = () => string;

export function fixedClock(
  value: Date | string | number = "2026-01-01T00:00:00.000Z",
): Clock {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    throw new RangeError("fixedClock requires a valid date");
  }

  return () => new Date(timestamp);
}

export function fixedId(value = "fixed-id"): IdFactory {
  return () => value;
}
