import { describe, it, expect } from 'vitest';
import { CALM_QUOTES, getDailyQuotes } from '../dailyQuotes';

describe('dailyQuotes.ts', () => {
  it('returns two quotes by default', () => {
    const quotes = getDailyQuotes(new Date(2026, 10, 16));
    expect(quotes).toHaveLength(2);
    expect(CALM_QUOTES).toContain(quotes[0]);
    expect(CALM_QUOTES).toContain(quotes[1]);
  });

  it('returns the same quotes for different times on the same local date', () => {
    const morning = new Date(2026, 10, 16, 8, 15, 0);
    const night = new Date(2026, 10, 16, 23, 45, 0);
    expect(getDailyQuotes(morning)).toEqual(getDailyQuotes(night));
  });

  it('returns different quotes on consecutive days', () => {
    const day1 = new Date(2026, 10, 16);
    const day2 = new Date(2026, 10, 17);
    expect(getDailyQuotes(day1)).not.toEqual(getDailyQuotes(day2));
  });

  it('cycles back to the same quotes after 10 days', () => {
    const day0 = new Date(2026, 10, 1);
    const day10 = new Date(2026, 10, 11);
    expect(getDailyQuotes(day10)).toEqual(getDailyQuotes(day0));
  });
});
