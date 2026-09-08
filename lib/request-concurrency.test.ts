import { describe, expect, it, vi } from 'vitest';
import { matchesRequestVersion, nextRequestTimestamp } from './request-concurrency';

describe('request versions', () => {
  const previous = new Date('2026-01-01T00:00:00.000Z');
  it.each([undefined, null, '', 'invalid', '2025-01-01', 1767225600000])('fails closed for %s', value => {
    expect(matchesRequestVersion(value, previous)).toBe(false);
  });
  it('accepts only the reviewed timestamp and always advances it', () => {
    expect(matchesRequestVersion(previous.toISOString(), previous)).toBe(true);
    const now = vi.spyOn(Date, 'now').mockReturnValue(previous.getTime());
    expect(nextRequestTimestamp(previous).getTime()).toBe(previous.getTime() + 1);
    now.mockReturnValue(previous.getTime() - 1000);
    expect(nextRequestTimestamp(previous).getTime()).toBe(previous.getTime() + 1);
    now.mockRestore();
  });
});
