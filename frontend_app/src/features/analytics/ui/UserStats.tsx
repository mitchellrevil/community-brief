import { useQuery, useQueryClient  } from '@tanstack/react-query';
import { Activity, Clock, FileText, Users } from 'lucide-react';
import type { PaginatedUsersResponse } from '@/features/users/data/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getSystemAnalytics } from '@/features/analytics/data/api';
import { getUsersTotalQuery } from '@/features/users/data/queries';
import { MotionList, MotionListItem } from '@/components/ui/motion-list';


interface UserStatsProps {
  /**
   * Number of days to filter data (default: 30)
   */
  periodDays?: number;
  /**
   * Optional business unit ID for filtering
   */
  businessUnitId?: string | null;
  /**
   * Custom class name for styling
   */
  className?: string;
}

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subtitle?: string;
  isLoading?: boolean;
}

function StatCard({ icon, title, value, subtitle, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-4 w-4 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value.toLocaleString()}</div>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * UserStats Component
 * 
 * Displays key metrics from the system analytics endpoint:
 * - Total Users
 * - Active Users (last 24h by default, or custom period)
 * - Total Analytics Jobs
 * - Total Minutes Processed
 * 
 * @example
 * ```tsx
 * // Basic usage with 30-day filter
 * <UserStats />
 * 
 * // Custom period (7 days)
 * <UserStats periodDays={7} />
 * 
 * // With business unit filter
 * <UserStats periodDays={30} businessUnitId="bu-123" />
 * ```
 */
export function UserStats({ periodDays = 30, businessUnitId = null, className = '' }: UserStatsProps) {
  const {
    data: systemAnalytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
    error: analyticsErrorObj,
  } = useQuery({
    queryKey: ['user-stats', periodDays, businessUnitId],
    queryFn: async () => {
      return await getSystemAnalytics(periodDays, businessUnitId || undefined);
    },
    staleTime: 60000, // 1 minute
    retry: 2,
  });

  // Fetch total users via shared users total query (deduped across app)
  const queryClient = useQueryClient();
  const baseUsersTotalOptions = getUsersTotalQuery(businessUnitId || undefined);

  // If there's already cached total data for this key, avoid fetching again.
  const cachedData = queryClient.getQueryData<PaginatedUsersResponse>(baseUsersTotalOptions.queryKey);
  const cachedTotal = cachedData?.total;
  const hasOverviewTotal = (systemAnalytics?.analytics.overview?.total_users ?? 0) > 0;
  const hasAnalyticsTotal = (systemAnalytics?.analytics.total_users ?? 0) > 0;

  // Only fetch paginated total if no cached/analytics/overview total exists
  const usersTotalQueryOptions = {
    ...baseUsersTotalOptions,
    enabled: !(hasOverviewTotal || hasAnalyticsTotal || (cachedTotal != null)),
  };

  const {
    data: usersPage,
    isLoading: usersPageLoading,
    isError: usersPageError,
  } = useQuery(usersTotalQueryOptions as any);



  // Prefer paginated users total when available (most authoritative for user management), then analytics.overview, then analytics.total_users
  const computedTotal = (() => {
    const paginated = (usersPage as any)?.total;
    const overview = systemAnalytics?.analytics.overview?.total_users;
    const analyticsTotal = systemAnalytics?.analytics.total_users;

    if (typeof paginated === 'number' && paginated > 0) return paginated;
    if (typeof overview === 'number' && overview > 0) return overview;
    if (typeof analyticsTotal === 'number' && analyticsTotal > 0) return analyticsTotal;

    // No positive values found; choose the first numeric value available (could be 0)
    if (typeof paginated === 'number') return paginated;
    if (typeof overview === 'number') return overview;
    if (typeof analyticsTotal === 'number') return analyticsTotal;

    return 0;
  })();

  const totalUsersCount = computedTotal;

  const stats = {
    totalUsers: totalUsersCount,
    activeUsers: systemAnalytics?.analytics.active_users ?? 0,
    totalJobs: systemAnalytics?.analytics.total_jobs ?? 0,
    totalMinutes: systemAnalytics?.analytics.total_minutes ?? 0,
  }; 

  const hasError = analyticsError || usersPageError;
  const errorMessage = (analyticsErrorObj)?.message ?? (usersPageError ? 'Failed to fetch users' : 'Unknown error');

  if (hasError) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertDescription>
          Failed to load user statistics: {errorMessage}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <MotionList className={`grid gap-4 md:grid-cols-2 lg:grid-cols-4 ${className}`}>
      <MotionListItem>
        <StatCard
          icon={<Users className="h-4 w-4" />}
          title="Total Users"
          value={stats.totalUsers}
          subtitle="Registered users"
          isLoading={analyticsLoading || usersPageLoading}
        />
      </MotionListItem>
      <MotionListItem>
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          title="Active Users"
          value={stats.activeUsers}
          subtitle={`Last ${periodDays} day${periodDays !== 1 ? 's' : ''}`}
          isLoading={analyticsLoading}
        />
      </MotionListItem>
      <MotionListItem>
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          title="Total Jobs"
          value={stats.totalJobs}
          subtitle={`Last ${periodDays} day${periodDays !== 1 ? 's' : ''}`}
          isLoading={analyticsLoading}
        />
      </MotionListItem>
      <MotionListItem>
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          title="Total Minutes"
          value={Math.round(stats.totalMinutes)}
          subtitle={`Last ${periodDays} day${periodDays !== 1 ? 's' : ''}`}
          isLoading={analyticsLoading}
        />
      </MotionListItem>
    </MotionList>
  );
}


