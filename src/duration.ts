const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function parseDuration(value: string): number {
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(ms|s|m|h|d|w)$/);
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use a whole number followed by ms, s, m, h, d, or w (for example "30m" or "1h").`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] as string;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`Invalid duration "${value}". The numeric value must be a positive whole number.`);
  }

  const multiplier = UNIT_TO_MS[unit];
  if (multiplier === undefined) {
    throw new Error(`Unsupported duration unit: ${unit}`);
  }

  return amount * multiplier;
}
