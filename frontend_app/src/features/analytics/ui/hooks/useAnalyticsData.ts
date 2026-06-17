import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SystemAnalytics } from '@/types/api';
import { getSystemAnalytics } from '@/features/analytics/data/api';
import { analyticsKeys } from '@/features/analytics/data/keys';
import { getBusinessUnitsQuery } from '@/shared/data/business-units/queries';
import { getUsersTotalQuery } from '@/features/users/data/queries';
import { usePermissionGuard, useUserPermissions } from '@/hooks/usePermissions';

// Types
export type AnalyticsPeriod = 7 | 30 | 180 | 365;

export function useAnalyticsData() {
  const [analyticsPeriod, setAnalyticsPeriodState] = useState<AnalyticsPeriod>(365);
  const [selectedBusinessUnit, setSelectedBusinessUnitState] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Permission / role info
  const { data: currentUser } = useUserPermissions();
  const guard = usePermissionGuard();
  const isAdmin = guard.isAdmin();
  const isEditor = guard.isEditor();
  const editorBusinessUnitIds = currentUser?.business_unit_ids || [];

  // Business units - filter for editors to only show ones they have access to
  const businessUnitsQuery = useQuery(getBusinessUnitsQuery());
  const allBusinessUnits = (businessUnitsQuery.data || []);
  
  // Filter business units based on permissions
  const businessUnits = useMemo(() => {
    if (isAdmin) {
      // Admins can see all business units
      return allBusinessUnits;
    }
    if (isEditor) {
      // Editors can only see business units they're assigned to
      return allBusinessUnits.filter(bu => editorBusinessUnitIds.includes(bu.id));
    }
    // Regular users don't see any business units
    return [];
  }, [allBusinessUnits, isAdmin, isEditor, editorBusinessUnitIds]);

  // Users - do not fetch full users list here (avoids duplicate heavy calls).
  // If a total is required, use the lightweight total query below.

  // Fetch total count for "All Users" fallback via shared query
  const usersTotalQuery = useQuery(getUsersTotalQuery());
  const totalUsers = (usersTotalQuery.data as any)?.total ?? null;

  // System analytics - fetch whenever period or business unit changes
  const systemAnalyticsQuery = useQuery<SystemAnalytics>({
    queryKey: analyticsKeys.system(analyticsPeriod, selectedBusinessUnit),
    queryFn: async () => getSystemAnalytics(analyticsPeriod, selectedBusinessUnit || undefined),
    staleTime: 60 * 1000, // cache for a minute
  });

  const systemAnalytics = systemAnalyticsQuery.data ?? null;
  const analyticsLoading = systemAnalyticsQuery.isLoading;

  // Effective BU: respect explicit selection; allow "All" (null) to request cross-BU analytics/leaderboards.
  const effectiveBusinessUnitId = selectedBusinessUnit;

  // Flatten analyticsData for chart components
  const analyticsData = useMemo(() => {
    if (!systemAnalytics) return [];
    const trends = systemAnalytics.analytics.trends || {} as any;
    const dailyActivity = trends.daily_activity ?? {};
    const dailyMinutes = trends.daily_transcription_minutes ?? {};
    const dailyActiveUsers = trends.daily_active_users ?? {};

    // Collect unique dates and sort
    const dates = Array.from(new Set([
      ...Object.keys(dailyActivity || {}),
      ...Object.keys(dailyMinutes || {}),
      ...Object.keys(dailyActiveUsers || {}),
    ]));

    dates.sort((a: string, b: string) => a.localeCompare(b));

    return dates.map((date) => ({
      date,
      totalMinutes: dailyMinutes[date] || 0,
      activeUsers: dailyActiveUsers[date] || 0,
      totalJobs: dailyActivity[date] || 0,
    }));
  }, [systemAnalytics]);

  const setAnalyticsPeriod = (p: AnalyticsPeriod) => {
    setAnalyticsPeriodState(p);
    queryClient.invalidateQueries({ queryKey: analyticsKeys.systemRoot() });
  };

  const setSelectedBusinessUnit = (id: string | null) => {
    setSelectedBusinessUnitState(id);
    queryClient.invalidateQueries({ queryKey: analyticsKeys.systemRoot() });
  };

  return {
    analyticsPeriod,
    setAnalyticsPeriod,
    selectedBusinessUnit,
    setSelectedBusinessUnit,
    businessUnits,
    totalUsers,
    systemAnalytics,
    analyticsLoading,
    isAdmin,
    isEditor,
    editorBusinessUnitIds,
    effectiveBusinessUnitId,
    analyticsData,
  } as const;
}

export default useAnalyticsData;


