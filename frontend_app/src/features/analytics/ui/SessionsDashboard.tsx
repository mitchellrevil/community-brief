import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, Filter, RefreshCw, ShieldCheck, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminSessions } from "@/features/analytics/data/api";
import { formatDateTime } from "@/lib/date-utils";

const statusStyles: Record<string, string> = {
  active: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  expired: "border-chart-4/40 bg-chart-4/10 text-chart-4",
  closed: "border-border bg-muted text-muted-foreground",
};

export function SessionsDashboard() {
  const [days, setDays] = useState("30");
  const [status, setStatus] = useState<string | null>(null);
  const [userIdFilter, setUserIdFilter] = useState("");

  const queryParams = useMemo(
    () => ({
      days: days === "total" ? 365 : Number(days),
      status: status || undefined,
      userId: userIdFilter.trim() || undefined,
      limit: 200,
      offset: 0,
    }),
    [days, status, userIdFilter],
  );

  const {
    data: sessions,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin-sessions", queryParams],
    queryFn: () => getAdminSessions(queryParams),
    staleTime: 30000,
  });

  const summary = sessions?.summary;
  const items = sessions?.items || [];
  const totalSeriesColor = "var(--color-chart-1)";
  const activeSeriesColor = "var(--color-chart-2)";
  const chartData = useMemo(() => {
    const counts: Record<string, { date: string; active: number; total: number } | undefined> = {};

    items.forEach((session) => {
      const dateKey = session.created_at.slice(0, 10);
      const entry = counts[dateKey] ?? { date: dateKey, active: 0, total: 0 };
      entry.total += 1;
      if (session.status === "active") {
        entry.active += 1;
      }
      counts[dateKey] = entry;
    });

    return Object.values(counts)
      .filter((entry): entry is { date: string; active: number; total: number } => !!entry)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items]);

  return (
    <div className="space-y-6">
      <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" />
              Session Oversight
            </CardTitle>
            <CardDescription>
              Monitor active and inactive sessions with normalized IPs and activity windows.
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Total Sessions
                  </div>
                  <div className="text-2xl font-semibold">{summary?.total_sessions ?? 0}</div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    Active
                  </div>
                  <div className="text-2xl font-semibold">{summary?.active_sessions ?? 0}</div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Expired
                  </div>
                  <div className="text-2xl font-semibold">{summary?.expired_sessions ?? 0}</div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    Closed
                  </div>
                  <div className="text-2xl font-semibold">{summary?.closed_sessions ?? 0}</div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Session Activity</CardTitle>
              <CardDescription>Filter by status, timeframe, or user id.</CardDescription>
            </div>
              <div className="flex flex-wrap gap-3">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Timeframe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last 12 months</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status ?? "all"} onValueChange={(value) => setStatus(value === "all" ? null : value)}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-0">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 w-full sm:w-[220px]"
                  placeholder="Filter by user id"
                  value={userIdFilter}
                  onChange={(event) => setUserIdFilter(event.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 && (
            <div className="mb-6 h-[220px]">
              <ResponsiveContainer width="100%" height="100%" aria-label="Active sessions chart">
                <AreaChart data={chartData} margin={{ left: 0, right: 16, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminActiveSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={activeSeriesColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={activeSeriesColor} stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="adminTotalSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={totalSeriesColor} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={totalSeriesColor} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip
                    formatter={(value, name) => [value, name === "active" ? "Active" : "Total"]}
                    labelFormatter={(label) => `Date: ${label}`}
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      borderColor: "var(--color-border)",
                      borderRadius: "0.75rem",
                      color: "var(--color-popover-foreground)",
                    }}
                    labelStyle={{ color: "var(--color-popover-foreground)" }}
                    itemStyle={{ color: "var(--color-popover-foreground)" }}
                  />
                  <Area type="monotone" dataKey="total" stroke={totalSeriesColor} fill="url(#adminTotalSessions)" />
                  <Area type="monotone" dataKey="active" stroke={activeSeriesColor} fill="url(#adminActiveSessions)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load session data. Try refreshing.
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No sessions match the current filters.
            </div>
          ) : (
            <div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-3 px-4 font-medium">User</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium">Start</th>
                      <th className="py-3 px-4 font-medium">Last Activity</th>
                      <th className="py-3 px-4 font-medium">Duration</th>
                      <th className="py-3 px-4 font-medium">IP (normalized)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((session) => (
                      <tr key={session.id} className="border-b hover:bg-muted/40">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div className="space-y-1">
                              <div className="font-medium">{session.user_email || session.user_id}</div>
                              <div className="text-xs text-muted-foreground">{session.user_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className={statusStyles[session.status] || ""}>
                            {session.status}
                          </Badge>
                          {session.end_reason && (
                            <div className="text-xs text-muted-foreground mt-1">{session.end_reason}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDateTime(session.created_at)}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDateTime(session.last_activity || session.last_heartbeat)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">
                            {session.duration_minutes ? `${session.duration_minutes.toFixed(1)}m` : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">{session.total_requests ?? 0} requests</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{session.ip_address || "—"}</div>
                          {session.ip_addresses && session.ip_addresses.length > 1 && (
                            <div className="text-xs text-muted-foreground">
                              {session.ip_addresses.length} unique
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="block sm:hidden space-y-2">
                {items.map((session) => (
                  <div key={session.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{session.user_email || session.user_id}</div>
                          <div className="text-xs text-muted-foreground truncate">{session.user_id}</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(session.last_activity || session.last_heartbeat)}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant="outline" className={statusStyles[session.status] || ""}>{session.status}</Badge>
                      <div className="text-sm font-medium">{session.duration_minutes ? `${session.duration_minutes.toFixed(1)}m` : "—"}</div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">IP: {session.ip_address || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


