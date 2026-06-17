export type AnalyticsPeriodKey = 7 | 30 | 180 | 365 | 'total';

export const analyticsKeys = {
  systemRoot: () => ['system-analytics'] as const,
  system: (period: AnalyticsPeriodKey, businessUnitId: string | null) =>
    ['system-analytics', period, businessUnitId] as const,
};
