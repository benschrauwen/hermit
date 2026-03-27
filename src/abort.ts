export function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /\babort(?:ed|ing)?\b/i.test(message);
}

export function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
