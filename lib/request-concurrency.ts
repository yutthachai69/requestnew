/** A timestamp is the version shown to the user, not one reloaded at submit. */
export function matchesRequestVersion(value: unknown, updatedAt: Date): boolean {
  return typeof value === 'string' && value.length > 0 &&
    new Date(value).getTime() === updatedAt.getTime();
}

export function nextRequestTimestamp(previous: Date): Date {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}
