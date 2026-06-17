import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  Clock3,
  Download,
  FileAudio,
  TrendingUp,
  Users,
} from "lucide-react";
import { PromptLeaderboard } from "./PromptLeaderboard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeading } from "@/components/ui/page-heading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportPromptAnalyticsCSV, exportSystemAnalyticsCSV } from "@/features/analytics/data/api";
import { AddUserToBusinessUnitDialog } from "@/features/analytics/ui/AddUserToBusinessUnitDialog";
import { AnalyticsChart } from "@/features/analytics/ui/AnalyticsChart";
import { RecentJobsCard } from "@/features/analytics/ui/RecentJobsCard";
import { SessionsDashboard } from "@/features/analytics/ui/SessionsDashboard";
import { UserAdoptionBoard } from "@/features/analytics/ui/UserAdoptionBoard";
import { buildAnalyticsInsights } from "@/features/analytics/ui/analytics-insights";
import { useAnalyticsData } from "@/features/analytics/ui/hooks/useAnalyticsData";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";

function SummaryCard({
  icon,
  label,
  value,
  caption,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="min-w-0 border-l border-border/70 px-4 py-3 first:border-l-0 sm:px-5 sm:py-3.5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="text-muted-foreground/80 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1.5 truncate text-xl font-semibold text-foreground sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

function formatWindowLabel(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) {
    return "Current reporting window";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(new Date(startDate))} to ${formatter.format(new Date(endDate))}`;
}

export function AnalyticsDashboard() {
  const {
    analyticsPeriod,
    setAnalyticsPeriod,
    selectedBusinessUnit,
    setSelectedBusinessUnit,
    businessUnits,
    systemAnalytics,
    analyticsLoading,
    isAdmin,
    isEditor,
    editorBusinessUnitIds,
    effectiveBusinessUnitId,
    analyticsData,
  } = useAnalyticsData();

  const canViewExtendedAnalytics = isAdmin || isEditor;
  const canViewSessionAnalytics = isAdmin;

  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingPrompts, setIsExportingPrompts] = useState(false);
  const breadcrumbs = useBreadcrumbs();

  const getBusinessUnitDisplayLabel = (businessUnitId: string | null) => {
    if (!businessUnitId) {
      return isEditor ? "All My Business Units" : "All Business Units";
    }

    const businessUnit = businessUnits.find((item: any) => item.id === businessUnitId);
    return businessUnit?.name || businessUnitId;
  };

  const isMockData = systemAnalytics?.analytics._is_mock_data === true;
  const latestAvailableTimestamp = systemAnalytics?.analytics.latest_available_timestamp;
  const hasHistoricalData = systemAnalytics?.analytics.has_historical_data === true;
  const windowLabel = formatWindowLabel(systemAnalytics?.start_date, systemAnalytics?.end_date);
  const insights = useMemo(() => buildAnalyticsInsights(systemAnalytics), [systemAnalytics]);
  const peakDay = useMemo(() => {
    const entries = Object.entries(systemAnalytics?.analytics.trends?.daily_activity ?? {});
    return entries.sort((left, right) => right[1] - left[1]).at(0) ?? null;
  }, [systemAnalytics]);

  const overviewCards = useMemo(() => {
    const totalJobs = systemAnalytics?.analytics.total_jobs ?? 0;
    const totalMinutes = Math.round(systemAnalytics?.analytics.total_minutes ?? 0);
    return [
      {
        label: "Tracked users",
        value: insights.coverage.trackedUsers.toLocaleString(),
        caption: "Users with recorded activity in this view",
        icon: <Users className="h-5 w-5" />,
      },
      {
        label: "Jobs",
        value: totalJobs.toLocaleString(),
        caption: windowLabel,
        icon: <FileAudio className="h-5 w-5" />,
      },
      {
        label: "Minutes processed",
        value: totalMinutes.toLocaleString(),
        caption: "Speech analysed in the selected scope",
        icon: <Clock3 className="h-5 w-5" />,
      },
      {
        label: "Peak day",
        value: peakDay ? `${peakDay[1].toLocaleString()} jobs` : "No peak day",
        caption: peakDay ? new Date(peakDay[0]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Waiting for more activity",
        icon: <TrendingUp className="h-5 w-5" />,
      },
    ];
  }, [insights.coverage.trackedUsers, peakDay, systemAnalytics, windowLabel]);

  const handleExportCSV = async () => {
    const period = analyticsPeriod;
    setIsExportingCSV(true);
    try {
      const blob = await exportSystemAnalyticsCSV(period, effectiveBusinessUnitId || undefined);
      const urlObject = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = urlObject;
      anchor.download = `system_analytics_${period}d.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(urlObject);
      }, 0);
    } catch (error) {
      console.error("Failed to export system analytics CSV:", error);
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleExportPrompts = async () => {
    const period = analyticsPeriod;
    setIsExportingPrompts(true);
    try {
      const csvText = await exportPromptAnalyticsCSV(period, effectiveBusinessUnitId || undefined);
      const blob = new Blob([csvText], { type: "text/csv" });
      const urlObject = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = urlObject;
      anchor.download = `prompts_leaderboard_${period}d.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(urlObject);
      }, 0);
    } catch (error) {
      console.error("Failed to export prompt analytics CSV:", error);
    } finally {
      setIsExportingPrompts(false);
    }
  };

  return (
    <div className="w-full max-w-full min-h-screen overflow-x-hidden bg-background">
      <PageHeading
        icon={<BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" />}
        title="Analytics"
        breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-16 sm:px-6 sm:py-5 md:pb-6">
        <div className="space-y-4 sm:space-y-5">
          <Card className="rounded-xl border border-border/70 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center content-xl:flex-nowrap">
                {(isAdmin || isEditor) && businessUnits.length > 0 && (
                  <div className="flex min-w-0 flex-1 items-center gap-2 lg:min-w-[260px] content-xl:max-w-[280px]">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Select
                      value={selectedBusinessUnit || "all"}
                      onValueChange={(value) => setSelectedBusinessUnit(value === "all" ? null : value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Business Unit">
                          <span className="truncate">{getBusinessUnitDisplayLabel(selectedBusinessUnit)}</span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {isEditor ? "All My Business Units" : "All Business Units"}
                        </SelectItem>
                        {businessUnits.map((businessUnit: any) => (
                          <SelectItem key={businessUnit.id} value={businessUnit.id}>
                            {businessUnit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex min-w-0 flex-1 items-center gap-2 lg:min-w-[180px] lg:flex-none">
                  <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Select
                    value={analyticsPeriod.toString()}
                    onValueChange={(value) => setAnalyticsPeriod(parseInt(value, 10) as 7 | 30 | 180 | 365)}
                  >
                    <SelectTrigger className="w-full lg:w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="180">Last 6 months</SelectItem>
                      <SelectItem value="365">Last 12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2 content-xl:ml-auto content-xl:flex-nowrap">
                  <Button
                    variant="outline"
                    onClick={handleExportCSV}
                    disabled={isExportingCSV}
                    className="h-9 rounded-lg"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {isExportingCSV ? "Exporting" : "Export CSV"}
                  </Button>

                  {isEditor && editorBusinessUnitIds.length > 0 ? (
                    <AddUserToBusinessUnitDialog
                      businessUnitId={editorBusinessUnitIds[0]}
                      onUserAdded={() => console.log("User added")}
                    />
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          {isMockData && (
            <Alert className="border-chart-4/30 bg-chart-4/10 text-foreground">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Demo data active</AlertTitle>
              <AlertDescription>
                The dashboard is currently showing sample analytics because no real analytics events were found.
                {systemAnalytics.analytics._mock_reason && ` Reason: ${systemAnalytics.analytics._mock_reason}`}
              </AlertDescription>
            </Alert>
          )}

          {!isMockData && (systemAnalytics?.analytics.total_jobs ?? 0) === 0 && hasHistoricalData && latestAvailableTimestamp && (
            <Alert className="border-border/70 bg-muted/40 text-foreground">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No analytics in this period</AlertTitle>
              <AlertDescription>
                No analytics records were found for the selected period. The latest available analytics event was on {new Date(latestAvailableTimestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Try a longer period such as Last 6 months or Last 12 months.
              </AlertDescription>
            </Alert>
          )}

          <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm min-[540px]:grid-cols-4">
              {overviewCards.map((card) => (
                <SummaryCard
                  key={card.label}
                  icon={card.icon}
                  label={card.label}
                  value={card.value}
                  caption={card.caption}
                />
              ))}
          </section>

          <Tabs defaultValue="overview" className="space-y-3">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted/70 p-1 shadow-sm">
              <TabsTrigger value="overview" className="rounded-lg px-3 py-2 text-sm">
                Overview
              </TabsTrigger>
              <TabsTrigger value="jobs" className="rounded-lg px-3 py-2 text-sm">
                Jobs
              </TabsTrigger>
              {canViewExtendedAnalytics ? (
                <TabsTrigger value="prompts" className="rounded-lg px-3 py-2 text-sm">
                  Prompts
                </TabsTrigger>
              ) : null}
              {canViewExtendedAnalytics ? (
                <TabsTrigger value="recent-jobs" className="rounded-lg px-3 py-2 text-sm">
                  Recent
                </TabsTrigger>
              ) : null}
              {canViewSessionAnalytics ? (
                <TabsTrigger value="session-data" className="rounded-lg px-3 py-2 text-sm">
                  Sessions
                </TabsTrigger>
              ) : null}
            </TabsList>
            <TabsContent value="overview" className="mt-0">
              <div className="space-y-4">
                <UserAdoptionBoard systemAnalytics={systemAnalytics} analyticsLoading={analyticsLoading} />
              </div>
            </TabsContent>

            <TabsContent value="jobs" className="mt-0">
              <Card className="overflow-hidden rounded-[24px] border border-border/80 bg-card shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle>Jobs over time</CardTitle>
                </CardHeader>
                <CardContent>
                  <AnalyticsChart
                    analyticsLoading={analyticsLoading}
                    analyticsData={analyticsData}
                    analyticsPeriod={analyticsPeriod}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {canViewExtendedAnalytics ? (
              <TabsContent value="prompts" className="mt-0">
                <PromptLeaderboard
                  days={analyticsPeriod}
                  businessUnitId={effectiveBusinessUnitId}
                  onExport={handleExportPrompts}
                  isExporting={isExportingPrompts}
                />
              </TabsContent>
            ) : null}

            {canViewExtendedAnalytics ? (
              <TabsContent value="recent-jobs" className="mt-0">
                <RecentJobsCard jobs={systemAnalytics?.analytics.recent_jobs || []} isLoading={analyticsLoading} />
              </TabsContent>
            ) : null}

            {canViewSessionAnalytics ? (
              <TabsContent value="session-data" className="mt-0">
                <SessionsDashboard />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
