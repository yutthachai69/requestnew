import { describe, expect, it } from 'vitest';
import {
  buildDateRangeFilter,
  endOfDayLocal,
  isDateOnly,
  isValidDateInput,
  startOfDayLocal,
} from './date-range';

/** "2026-09-01 07:30:00" style local-time label, independent of the host TZ. */
function localLabel(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

describe('startOfDayLocal / endOfDayLocal', () => {
  it('treats a date-only string as local midnight, not UTC midnight', () => {
    // The bug this guards: `new Date('2026-09-01')` is UTC midnight, which on a
    // UTC+7 server is 07:00 local — so the first 7 hours of the day fall outside
    // the report range and silently disappear.
    expect(localLabel(startOfDayLocal('2026-09-01'))).toBe('2026-09-01 00:00:00.000');
    expect(localLabel(endOfDayLocal('2026-09-01'))).toBe('2026-09-01 23:59:59.999');
  });

  it('covers a request created just after local midnight on the start date', () => {
    const range = buildDateRangeFilter('2026-09-01', '2026-09-01');
    const justAfterMidnight = new Date(2026, 8, 1, 0, 5, 0, 0);
    const justBeforeMidnight = new Date(2026, 8, 1, 23, 55, 0, 0);

    expect(range?.gte).toBeDefined();
    expect(range?.lte).toBeDefined();
    expect(justAfterMidnight >= range!.gte!).toBe(true);
    expect(justAfterMidnight <= range!.lte!).toBe(true);
    expect(justBeforeMidnight <= range!.lte!).toBe(true);
  });

  it('excludes the minute before and after the selected day', () => {
    const range = buildDateRangeFilter('2026-09-01', '2026-09-01');
    const previousDayLastMinute = new Date(2026, 7, 31, 23, 59, 0, 0);
    const nextDayFirstMinute = new Date(2026, 8, 2, 0, 0, 0, 0);

    expect(previousDayLastMinute >= range!.gte!).toBe(false);
    expect(nextDayFirstMinute <= range!.lte!).toBe(false);
  });

  it('handles month and year boundaries', () => {
    expect(localLabel(startOfDayLocal('2026-01-01'))).toBe('2026-01-01 00:00:00.000');
    expect(localLabel(endOfDayLocal('2026-12-31'))).toBe('2026-12-31 23:59:59.999');
    expect(localLabel(endOfDayLocal('2028-02-29'))).toBe('2028-02-29 23:59:59.999'); // leap year
  });

  it('respects an explicit timestamp instead of forcing it to a day boundary', () => {
    const explicit = startOfDayLocal('2026-09-01T09:30:00.000Z');
    expect(explicit.toISOString()).toBe('2026-09-01T09:30:00.000Z');
  });
});

describe('buildDateRangeFilter', () => {
  it('returns undefined when neither bound is given', () => {
    expect(buildDateRangeFilter(undefined, undefined)).toBeUndefined();
    expect(buildDateRangeFilter('', '   ')).toBeUndefined();
    expect(buildDateRangeFilter(null, null)).toBeUndefined();
  });

  it('supports an open-ended range', () => {
    const fromOnly = buildDateRangeFilter('2026-09-01', undefined);
    expect(fromOnly?.gte).toBeDefined();
    expect(fromOnly?.lte).toBeUndefined();

    const toOnly = buildDateRangeFilter(undefined, '2026-09-30');
    expect(toOnly?.gte).toBeUndefined();
    expect(toOnly?.lte).toBeDefined();
  });
});

describe('isDateOnly / isValidDateInput', () => {
  it('recognises date-only strings', () => {
    expect(isDateOnly('2026-09-01')).toBe(true);
    expect(isDateOnly(' 2026-09-01 ')).toBe(true);
    expect(isDateOnly('2026-09-01T00:00:00Z')).toBe(false);
  });

  it('rejects malformed and impossible dates', () => {
    for (const bad of ['', '   ', 'not-a-date', '2026-13-01', '2026-02-31', '2026-00-10']) {
      expect(isValidDateInput(bad), bad).toBe(false);
    }
  });

  it('accepts real dates in both forms', () => {
    for (const good of ['2026-09-01', '2028-02-29', '2026-09-01T09:30:00.000Z']) {
      expect(isValidDateInput(good), good).toBe(true);
    }
  });
});
