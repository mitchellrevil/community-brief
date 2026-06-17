import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface AnalyticsChartProps {
  analyticsLoading: boolean;
  analyticsData: Array<{
    date: string;
    totalMinutes: number;
    activeUsers: number;
    totalJobs?: number;
  }>;
  analyticsPeriod: 7 | 30 | 180 | 365;
}

interface JobsChartPoint {
  label: string;
  jobs: number;
  rangeLabel: string;
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function startOfWeek(date: Date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - day);
  return utcDate;
}

function endOfWeek(date: Date) {
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

function buildChartData(
  analyticsData: AnalyticsChartProps["analyticsData"],
  analyticsPeriod: AnalyticsChartProps["analyticsPeriod"],
): Array<JobsChartPoint> {
  if (analyticsData.length === 0) {
    return [];
  }

  if (analyticsPeriod === 365) {
    const monthlyBuckets = new Map<string, JobsChartPoint>();

    analyticsData.forEach((entry) => {
      const date = new Date(entry.date);
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      const existing = monthlyBuckets.get(key);
      const point = existing ?? {
        label: formatMonthLabel(date),
        jobs: 0,
        rangeLabel: formatMonthLabel(date),
      };

      point.jobs += entry.totalJobs ?? 0;
      monthlyBuckets.set(key, point);
    });

    return Array.from(monthlyBuckets.values());
  }

  if (analyticsPeriod === 180) {
    const weeklyBuckets = new Map<string, JobsChartPoint>();

    analyticsData.forEach((entry) => {
      const date = new Date(entry.date);
      const weekStart = startOfWeek(date);
      const weekEnd = endOfWeek(weekStart);
      const key = weekStart.toISOString().slice(0, 10);
      const existing = weeklyBuckets.get(key);
      const point = existing ?? {
        label: formatDayLabel(weekStart),
        jobs: 0,
        rangeLabel: `${formatDayLabel(weekStart)} to ${formatDayLabel(weekEnd)}`,
      };

      point.jobs += entry.totalJobs ?? 0;
      weeklyBuckets.set(key, point);
    });

    return Array.from(weeklyBuckets.values());
  }

  return analyticsData.map((entry) => {
    const date = new Date(entry.date);
    const label = formatDayLabel(date);
    return {
      label,
      jobs: entry.totalJobs ?? 0,
      rangeLabel: new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date),
    };
  });
}

export function AnalyticsChart({ analyticsLoading, analyticsData, analyticsPeriod }: AnalyticsChartProps) {
  const chartData = useMemo(
    () => buildChartData(analyticsData, analyticsPeriod),
    [analyticsData, analyticsPeriod],
  );

  const jobsColor = "var(--color-chart-1)";
  const gridColor = "var(--color-border)";
  const axisColor = "var(--color-muted-foreground)";

  return (
    <div>
      {analyticsLoading ? (
        <div className="flex h-[320px] items-center justify-center" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" aria-hidden="true"></div>
          <span className="sr-only">Loading analytics data...</span>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground" role="status" aria-live="polite">
          No jobs were recorded in the selected period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320} aria-label="Jobs over time chart">
          <BarChart data={chartData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" strokeOpacity={0.45} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 12 }}
              tickMargin={10}
              interval={analyticsPeriod === 7 ? 0 : "preserveStartEnd"}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tick={{ fill: axisColor, fontSize: 12 }}
              width={36}
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", fillOpacity: 0.35 }}
              formatter={(value) => [`${Number(value).toLocaleString()} jobs`, "Jobs"]}
              labelFormatter={(_, payload) => payload[0]?.payload.rangeLabel ?? "Selected period"}
              contentStyle={{
                backgroundColor: "var(--color-popover)",
                borderColor: "var(--color-border)",
                borderRadius: "0.75rem",
                color: "var(--color-popover-foreground)",
              }}
              labelStyle={{ color: "var(--color-popover-foreground)" }}
              itemStyle={{ color: "var(--color-popover-foreground)" }}
            />
            <Bar
              dataKey="jobs"
              fill={jobsColor}
              radius={[8, 8, 0, 0]}
              maxBarSize={analyticsPeriod === 7 ? 42 : 28}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
