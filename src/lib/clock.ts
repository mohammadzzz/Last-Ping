export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

let current: Clock = systemClock;

export function getClock(): Clock {
  return current;
}

export function setClockForTesting(c: Clock) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setClockForTesting is not available in production");
  }
  current = c;
}

export function resetClockForTesting() {
  current = systemClock;
}
