import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  FileAudio,
  Search,
  TrendingUp,
} from "lucide-react";
import {  buildAnalyticsInsights } from "./analytics-insights";
import type {UserActivityInsight} from "./analytics-insights";
import type { SystemAnalytics } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface UserAdoptionBoardProps {
  systemAnalytics: SystemAnalytics | null;
  analyticsLoading: boolean;
}

function formatMinutes(minutes: number) {
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)} hrs`;
  }

  if (minutes >= 10) {
    return `${Math.round(minutes)} mins`;
  }

  return `${minutes.toFixed(1)} mins`;
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function RankingList({
  title,
  icon,
  search,
  accentClassName,
  users,
  selectedUserId,
  onSelect,
  emptyState,
}: {
  title: string;
  icon: React.ReactNode;
  search?: React.ReactNode;
  accentClassName: string;
  users: Array<UserActivityInsight>;
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
  emptyState: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          <span>{title}</span>
          <Badge variant="secondary" className={cn("rounded-md border-0", accentClassName)}>
            {users.length}
          </Badge>
        </div>
        {search}
      </div>

      <div className="divide-y divide-border/60">
        {users.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">
            {emptyState}
          </div>
        ) : (
          users.map((user, index) => {
            const position = index + 1;
            const isSelected = user.userId === selectedUserId;
            return (
              <button
                key={`${title}-${user.userId}`}
                type="button"
                onClick={() => onSelect(user.userId)}
                className={cn(
                  "grid w-full grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-3 px-5 py-3.5 text-left transition",
                  isSelected
                    ? "bg-primary/5 text-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold", isSelected ? "bg-primary text-primary-foreground" : accentClassName)}>
                  {position}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{user.email}</p>
                  <p className={cn("truncate text-xs", isSelected ? "text-foreground" : "text-muted-foreground")}>
                    {user.totalJobs.toLocaleString()} jobs, {formatMinutes(user.totalMinutes)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{Math.round(user.shareOfJobs * 100)}%</p>
                  <p className={cn("text-xs", isSelected ? "text-foreground" : "text-muted-foreground")}>
                    of jobs
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function UserAdoptionBoard({
  systemAnalytics,
  analyticsLoading,
}: UserAdoptionBoardProps) {
  const insights = useMemo(() => buildAnalyticsInsights(systemAnalytics), [systemAnalytics]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    if (!deferredQuery) {
      return insights.rankedUsers;
    }

    return insights.rankedUsers.filter((user) => {
      return (
        user.email.toLowerCase().includes(deferredQuery) ||
        user.userId.toLowerCase().includes(deferredQuery) ||
        user.categories.some((category) => category.toLowerCase().includes(deferredQuery))
      );
    });
  }, [deferredQuery, insights.rankedUsers]);

  const filteredTopUsers = filteredUsers.slice(0, 5);

  useEffect(() => {
    if (filteredUsers.length === 0) {
      if (selectedUserId !== null) {
        setSelectedUserId(null);
      }
      return;
    }

    if (!selectedUserId || !filteredUsers.some((user) => user.userId === selectedUserId)) {
      setSelectedUserId(filteredUsers[0].userId);
    }
  }, [filteredUsers, selectedUserId]);

  const selectedUser = filteredUsers.find((user) => user.userId === selectedUserId) ?? filteredUsers.at(0) ?? null;
  const selectedUserLastSeen = selectedUser?.lastActivity
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(selectedUser.lastActivity))
    : "No timestamp";

  if (analyticsLoading) {
    return (
      <div className="grid gap-4 px-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Skeleton className="h-[330px] rounded-lg" />
        <Skeleton className="h-[330px] rounded-lg" />
      </div>
    );
  }

  return (
    <section>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <RankingList
          title="Most engaged"
          icon={<TrendingUp className="h-4 w-4 text-chart-2" />}
          search={
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  startTransition(() => setQuery(nextValue));
                }}
                placeholder={`Search ${insights.coverage.trackedUsers.toLocaleString()} users`}
                className="h-8 rounded-md border-border/80 bg-background pl-8 text-sm shadow-none"
              />
            </div>
          }
          accentClassName="bg-chart-2/15 text-chart-2"
          users={filteredTopUsers}
          selectedUserId={selectedUserId}
          onSelect={setSelectedUserId}
          emptyState="No users match the current search."
        />

        <div className="border-t border-border/70 p-5 lg:border-l lg:border-t-0 xl:p-6">
          {selectedUser ? (
            <div className="flex h-full min-h-[260px] flex-col">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-foreground">
                    {selectedUser.email}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Last active {selectedUserLastSeen}
                  </p>
                </div>
                <Badge variant="outline" className="w-fit rounded-md border-border bg-background">
                  {Math.round(selectedUser.shareOfJobs * 100)}% of jobs
                </Badge>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-4 border-y border-border/70 py-4">
                <SummaryPill label="Jobs" value={selectedUser.totalJobs.toLocaleString()} />
                <SummaryPill label="Minutes" value={formatMinutes(selectedUser.totalMinutes)} />
                <SummaryPill label="Avg/job" value={formatMinutes(selectedUser.averageMinutesPerJob)} />
              </div>

              <div className="mt-auto grid gap-3 pt-6 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span>{selectedUser.activeDays.toLocaleString()} active days</span>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <FileAudio className="h-4 w-4 shrink-0" />
                  <span className="truncate">{selectedUser.latestFileName || "No latest file"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[260px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No tracked users are available for this scope and period.
            </div>
          )}
        </div>

      
      </div>
    </section>
  );
}
