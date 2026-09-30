import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, Monitor, RefreshCw, Smartphone, Timer, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserSessionAnalytics } from "@/features/users/data/api";
import { formatDateTime } from "@/lib/date-utils";
import { listContainerStagger, listItemFadeInUp } from "@/lib/motion";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";

interface UserSessionOverviewProps {
  userId: string;
  days: number;
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  expired: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  closed: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

const formatDuration = (minutes: number | undefined) => {
  if (!minutes || minutes <= 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes}m`;
};

export function UserSessionOverview({ userId, days }: UserSessionOverviewProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-session-analytics", userId, days],
    queryFn: () => getUserSessionAnalytics(userId, { days }),
    enabled: Boolean(userId),
    staleTime: 30000,
  });

  const statusCounts: Record<string, number | undefined> = data?.performance_metrics?.sessions_by_status || {};
  const activeSessions = statusCounts.active ?? 0;
  const totalRequests = data?.performance_metrics?.total_requests ?? 0;
  const totalActivity = data?.performance_metrics?.total_activity_events ?? 0;
  const avgDuration = data?.performance_metrics?.average_session_duration ?? 0;

  const browserDistribution = data?.usage_analytics?.browser_distribution || {};
  const platformDistribution = data?.usage_analytics?.platform_distribution || {};

  const timeline = useMemo(() => {
    if (!data?.session_timeline.length) return [];
    return [...data.session_timeline].sort((a, b) =>
      (b.start_time || "").localeCompare(a.start_time || "")
    );
  }, [data?.session_timeline]);

  if (isLoading) {
    return (
      <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" />
            Session Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" />
            Session Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load session analytics.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" />
              Session Overview
            </CardTitle>
              </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-lg border border-muted-foreground/10 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-4 w-4" />
                Total Sessions
              </div>
              <div className="text-2xl font-semibold">{data.total_sessions}</div>
            </div>
            <div className="rounded-lg border border-muted-foreground/10 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-4 w-4" />
                Active Sessions
              </div>
              <div className="text-2xl font-semibold">{activeSessions}</div>
            </div>
            <div className="rounded-lg border border-muted-foreground/10 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Timer className="h-4 w-4" />
                Avg Duration
              </div>
              <div className="text-2xl font-semibold">{formatDuration(avgDuration)}</div>
            </div>
            <div className="rounded-lg border border-muted-foreground/10 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-4 w-4" />
                Requests
              </div>
              <div className="text-2xl font-semibold">{totalRequests}</div>
              <div className="text-xs text-muted-foreground">{totalActivity} activity events</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-5 w-5" />
              Browser Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(browserDistribution).length === 0 ? (
              <div className="text-sm text-muted-foreground">No browser data.</div>
            ) : (
              Object.entries(browserDistribution)
                .sort(([, a], [, b]) => Number(b) - Number(a))
                .map(([browser, count]) => {
                  const total = Object.values(browserDistribution).reduce((sum, v) => sum + Number(v), 0);
                  const percentage = total ? (Number(count) / total) * 100 : 0;
                  return (
                    <div key={browser} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{browser}</span>
                        <span className="text-muted-foreground">{count} · {percentage.toFixed(1)}%</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-5 w-5" />
              Device Platforms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(platformDistribution).length === 0 ? (
              <div className="text-sm text-muted-foreground">No platform data.</div>
            ) : (
              Object.entries(platformDistribution)
                .sort(([, a], [, b]) => Number(b) - Number(a))
                .map(([platform, count]) => {
                  const total = Object.values(platformDistribution).reduce((sum, v) => sum + Number(v), 0);
                  const percentage = total ? (Number(count) / total) * 100 : 0;
                  return (
                    <div key={platform} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{platform}</span>
                        <span className="text-muted-foreground">{count} · {percentage.toFixed(1)}%</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Recent Session Windows</CardTitle>
          <CardDescription>Latest session ranges with device details.</CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <div className="text-sm text-muted-foreground">No sessions available.</div>
          ) : (
            <div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium">Start</th>
                      <th className="py-3 px-4 font-medium">End</th>
                      <th className="py-3 px-4 font-medium">Device</th>
                      <th className="py-3 px-4 font-medium">IP</th>
                    </tr>
                  </thead>
                  <motion.tbody
                    variants={listContainerStagger}
                    initial="hidden"
                    animate="visible"
                  >
                    {timeline.slice(0, 8).map((session) => (
                      <motion.tr key={session.session_id} variants={listItemFadeInUp} className="border-b hover:bg-muted/40">
                        <td className="py-3 px-4">
                          <Badge variant="outline" className={statusStyles[session.status || ""] || ""}>
                            {session.status || "unknown"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDateTime(session.start_time)}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {session.end_time ? formatDateTime(session.end_time) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">
                            {session.client_info?.platform || "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {session.client_info?.browser || "Unknown"}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {session.client_info?.ip_address || "—"}
                        </td>
                      </motion.tr>
                    ))}
                  </motion.tbody>
                </table>
              </div>

              <MotionList as="div" className="block sm:hidden space-y-2">
                {timeline.slice(0, 8).map((session) => (
                  <MotionListItem key={session.session_id} as="div" className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={statusStyles[session.status || ""] || ""}>
                        {session.status || "unknown"}
                      </Badge>
                      <div className="text-xs text-muted-foreground">{formatDateTime(session.start_time)}</div>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium">{session.client_info?.platform || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">{session.client_info?.browser || "Unknown"}</div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{session.client_info?.ip_address || "—"}</div>
                  </MotionListItem>
                ))}
              </MotionList>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


