import { describe, expect, it } from 'vitest';
import { transformSystemAnalytics } from '@/features/analytics/data/api';

describe('transformSystemAnalytics', () => {
  it('returns safe analytics shape when analytics property is missing', () => {
    const input: any = {
      period_days: 30,
      start_date: '2024-01-01T00:00:00Z',
      end_date: '2024-01-31T23:59:59Z',
      // analytics missing intentionally
    };

    const out = transformSystemAnalytics(input);

    expect(out).toBeTruthy();
    expect(out.analytics).toBeDefined();
    expect(out.analytics.records).toEqual([]);
    expect(out.analytics.total_minutes).toBe(0);
    expect(out.analytics.total_jobs).toBe(0);
  });
});

