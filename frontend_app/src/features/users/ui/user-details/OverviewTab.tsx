import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, FileAudio, Loader2 } from "lucide-react";
import type { User } from "@/features/users/data/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserAnalytics, getUserMinutes } from "@/features/analytics/data/api";
import { UserSessionOverview } from "@/features/users/ui/UserSessionOverview";

interface OverviewTabProps {
  user: User;
}

export function OverviewTab({ user }: OverviewTabProps) {
  const [scopeDays, setScopeDays] = useState<string>("30");

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["user-analytics", user.id, scopeDays],
    queryFn: () => getUserAnalytics(user.id, parseInt(scopeDays)),
  });

  const { data: minutes, isLoading: minutesLoading } = useQuery({
    queryKey: ["user-minutes", user.id, scopeDays],
    queryFn: () => getUserMinutes(user.id, parseInt(scopeDays)),
  });

  const isLoading = analyticsLoading || minutesLoading;

  const formatDuration = (minutesValue: number) => {
    if (!minutesValue || isNaN(minutesValue) || minutesValue === 0) return `0m`;
    if (minutesValue < 1) {
      const secs = Math.round(minutesValue * 60);
      return `${secs}s`;
    }
    const roundedMinutes = Math.floor(minutesValue);
    if (roundedMinutes < 60) {
      return `${roundedMinutes}m`;
    }
    const hours = Math.floor(roundedMinutes / 60);
    const remainingMinutes = roundedMinutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  // Derived stats (defensive: guard against missing analytics/transcription_stats)
  const totalMinutes = minutes
    ? minutes.total_minutes
    : analytics?.analytics.transcription_stats.total_minutes ?? 0;
  const totalJobs = minutes
    ? minutes.total_records
    : analytics?.analytics.transcription_stats.total_jobs ?? 0;
  const avgDuration = totalJobs > 0 ? totalMinutes / totalJobs : 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-start sm:justify-end">
        <Select value={scopeDays} onValueChange={setScopeDays}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 Hours</SelectItem>
            <SelectItem value="7">Last 7 Days</SelectItem>
            <SelectItem value="30">Last 30 Days</SelectItem>
            <SelectItem value="180">Last 6 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transcription Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="text-2xl font-bold">{formatDuration(totalMinutes)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              In the selected period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <FileAudio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="text-2xl font-bold">{totalJobs}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Processed files
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Job Duration</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="text-2xl font-bold">{formatDuration(avgDuration)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Average length per file
            </p>
          </CardContent>
        </Card>
      </div>

      <UserSessionOverview userId={user.id} days={parseInt(scopeDays)} />
    </div>
  );
}


