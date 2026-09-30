/**
 * Admin Dashboard Component
 * 
 * Displays key analytics and metrics for administrators.
 */

import { useEffect, useState } from "react";
import { Activity, Clock, FileText, Loader2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export interface DashboardStats {
  totalUsers: number;
  totalRecordings: number;
  totalMinutes: number;
  activeUsers: number;
}

export interface AdminDashboardProps {
  /** Function to fetch dashboard stats */
  onLoadStats: () => Promise<DashboardStats>;
  /** Title for the dashboard */
  title?: string;
  /** Additional class names */
  className?: string;
}

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: number;
  isLoading?: boolean;
}

function StatCard({ icon, title, value, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-4 w-4 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" data-testid="stat-loading" />
        ) : (
          <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {value.toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * AdminDashboard - Shows key metrics loaded on mount.
 * 
 * @example
 * ```tsx
 * <AdminDashboard 
 *   onLoadStats={async () => await fetchDashboardStats()}
 *   title="System Overview"
 * />
 * ```
 */
export function AdminDashboard({
  onLoadStats,
  title = "Admin Dashboard",
  className,
}: AdminDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await onLoadStats();
        setStats(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load stats";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [onLoadStats]);

  if (error) {
    return (
      <div className={className}>
        <h1 className="text-2xl font-bold mb-4">{title}</h1>
        <Alert variant="destructive" data-testid="dashboard-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}
      </div>

      <div 
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        data-testid="stats-grid"
      >
        <StatCard
          icon={<Users className="h-4 w-4" />}
          title="Total Users"
          value={stats?.totalUsers ?? 0}
          isLoading={isLoading}
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          title="Total Recordings"
          value={stats?.totalRecordings ?? 0}
          isLoading={isLoading}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          title="Total Minutes"
          value={stats?.totalMinutes ?? 0}
          isLoading={isLoading}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          title="Active Users"
          value={stats?.activeUsers ?? 0}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

export default AdminDashboard;
