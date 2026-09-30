import type {
  AnalyticsRecord,
  AnalyticsUserAggregate,
  SystemAnalytics,
} from "@/types/api";

export interface UserActivityInsight {
  userId: string;
  email: string;
  totalJobs: number;
  totalMinutes: number;
  averageMinutesPerJob: number;
  shareOfJobs: number;
  shareOfMinutes: number;
  activeDays: number;
  lastActivity: string | null;
  latestFileName: string | null;
  categories: Array<string>;
  recentRecords: Array<AnalyticsRecord>;
}

export interface AnalyticsInsights {
  rankedUsers: Array<UserActivityInsight>;
  topUsers: Array<UserActivityInsight>;
  lowerUsers: Array<UserActivityInsight>;
  busiestUser: UserActivityInsight | null;
  lowestTrackedUser: UserActivityInsight | null;
  averages: {
    jobsPerTrackedUser: number;
    minutesPerTrackedUser: number;
    minutesPerJob: number;
  };
  coverage: {
    trackedUsers: number;
    knownUsers: number;
    includesInactiveUsers: boolean;
    note: string;
  };
  peakDay: {
    date: string;
    totalJobs: number;
  } | null;
  peakHour: {
    hour: string;
    totalEvents: number;
  } | null;
  longestRecording: AnalyticsRecord | null;
}

type MutableUserBucket = {
  userId: string;
  email: string;
  totalJobs: number;
  totalMinutes: number;
  activeDates: Set<string>;
  lastActivity: string | null;
  latestFileName: string | null;
  categories: Set<string>;
  recentRecords: Array<AnalyticsRecord>;
};

function compareIsoTimestamps(left: string | null, right: string | null) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return Date.parse(left) - Date.parse(right);
}

function sortUsersDescending(left: UserActivityInsight, right: UserActivityInsight) {
  return (
    right.totalJobs - left.totalJobs ||
    right.totalMinutes - left.totalMinutes ||
    compareIsoTimestamps(right.lastActivity, left.lastActivity) ||
    left.email.localeCompare(right.email)
  );
}

function sortUsersAscending(left: UserActivityInsight, right: UserActivityInsight) {
  return (
    left.totalJobs - right.totalJobs ||
    left.totalMinutes - right.totalMinutes ||
    compareIsoTimestamps(left.lastActivity, right.lastActivity) ||
    left.email.localeCompare(right.email)
  );
}

function createBucket(userId: string, email?: string): MutableUserBucket {
  return {
    userId,
    email: email || userId,
    totalJobs: 0,
    totalMinutes: 0,
    activeDates: new Set<string>(),
    lastActivity: null,
    latestFileName: null,
    categories: new Set<string>(),
    recentRecords: [],
  };
}

function mergeAggregateUsers(
  buckets: Map<string, MutableUserBucket>,
  aggregateUsers: Array<AnalyticsUserAggregate>,
) {
  for (const aggregateUser of aggregateUsers) {
    const existing = buckets.get(aggregateUser.user_id) ?? createBucket(aggregateUser.user_id, aggregateUser.email);
    existing.email = aggregateUser.email || existing.email;
    existing.totalJobs = aggregateUser.total_jobs;
    existing.totalMinutes = aggregateUser.total_minutes;
    buckets.set(aggregateUser.user_id, existing);
  }
}

function hydrateFromRecords(
  buckets: Map<string, MutableUserBucket>,
  records: Array<AnalyticsRecord>,
  hasAggregateUsers: boolean,
) {
  for (const record of records) {
    if (!record.user_id) {
      continue;
    }

    const existing = buckets.get(record.user_id) ?? createBucket(record.user_id, record.email);
    existing.email = record.email || existing.email;

    if (!hasAggregateUsers || existing.totalJobs === 0) {
      existing.totalJobs += 1;
      existing.totalMinutes += typeof record.audio_duration_minutes === "number" ? record.audio_duration_minutes : 0;
    }

    if (record.timestamp) {
      existing.activeDates.add(record.timestamp.split("T")[0]);
      if (compareIsoTimestamps(record.timestamp, existing.lastActivity) > 0) {
        existing.lastActivity = record.timestamp;
        existing.latestFileName = record.file_name ?? existing.latestFileName;
      }
    }

    if (record.prompt_category_id) {
      existing.categories.add(record.prompt_category_id);
    }

    existing.recentRecords.push(record);
    buckets.set(record.user_id, existing);
  }
}

function normaliseBuckets(
  buckets: Map<string, MutableUserBucket>,
  totalJobs: number,
  totalMinutes: number,
) {
  const rankedUsers = Array.from(buckets.values())
    .filter((bucket) => bucket.totalJobs > 0 || bucket.totalMinutes > 0 || bucket.recentRecords.length > 0)
    .map<UserActivityInsight>((bucket) => {
      const recentRecords = [...bucket.recentRecords].sort((left, right) => {
        return compareIsoTimestamps(right.timestamp, left.timestamp);
      });

      return {
        userId: bucket.userId,
        email: bucket.email,
        totalJobs: bucket.totalJobs,
        totalMinutes: bucket.totalMinutes,
        averageMinutesPerJob: bucket.totalJobs > 0 ? bucket.totalMinutes / bucket.totalJobs : 0,
        shareOfJobs: totalJobs > 0 ? bucket.totalJobs / totalJobs : 0,
        shareOfMinutes: totalMinutes > 0 ? bucket.totalMinutes / totalMinutes : 0,
        activeDays: bucket.activeDates.size,
        lastActivity: bucket.lastActivity,
        latestFileName: bucket.latestFileName,
        categories: Array.from(bucket.categories),
        recentRecords,
      };
    })
    .sort(sortUsersDescending);

  return rankedUsers;
}

export function buildAnalyticsInsights(systemAnalytics: SystemAnalytics | null): AnalyticsInsights {
  const analytics = systemAnalytics?.analytics;
  const records = analytics?.records ?? [];
  const aggregateUsers = analytics?.users ?? [];
  const totalJobs = analytics?.total_jobs ?? 0;
  const totalMinutes = analytics?.total_minutes ?? 0;
  const knownUsers =
    analytics?.overview?.total_users ?? analytics?.total_users ?? aggregateUsers.length;

  const buckets = new Map<string, MutableUserBucket>();
  const hasAggregateUsers = aggregateUsers.length > 0;

  if (hasAggregateUsers) {
    mergeAggregateUsers(buckets, aggregateUsers);
  }

  hydrateFromRecords(buckets, records, hasAggregateUsers);

  // Prevent share percentages larger than 100% when upstream totals are inconsistent
  const sumBucketJobs = Array.from(buckets.values()).reduce((s, b) => s + b.totalJobs, 0);
  const sumBucketMinutes = Array.from(buckets.values()).reduce((s, b) => s + b.totalMinutes, 0);

  const denominatorJobs = Math.max(totalJobs, sumBucketJobs);
  const denominatorMinutes = Math.max(totalMinutes, sumBucketMinutes);

  const rankedUsers = normaliseBuckets(buckets, denominatorJobs, denominatorMinutes);
  const lowerUsers = [...rankedUsers].sort(sortUsersAscending).slice(0, 5);
  const peakDayEntry = Object.entries(analytics?.trends?.daily_activity ?? {}).sort((left, right) => {
    return right[1] - left[1] || left[0].localeCompare(right[0]);
  }).at(0);
  const peakHourEntry = Object.entries(analytics?.usage?.peak_hours ?? {}).sort((left, right) => {
    return right[1] - left[1] || left[0].localeCompare(right[0]);
  }).at(0);
  const longestRecording = [...records].sort((left, right) => {
    return (right.audio_duration_minutes ?? 0) - (left.audio_duration_minutes ?? 0);
  })[0] ?? null;
  const trackedUsers = rankedUsers.length;
  const includesInactiveUsers = knownUsers > 0 && trackedUsers >= knownUsers;

  return {
    rankedUsers,
    topUsers: rankedUsers.slice(0, 5),
    lowerUsers,
    busiestUser: rankedUsers[0] ?? null,
    lowestTrackedUser: lowerUsers[0] ?? null,
    averages: {
      jobsPerTrackedUser: trackedUsers > 0 ? totalJobs / trackedUsers : 0,
      minutesPerTrackedUser: trackedUsers > 0 ? totalMinutes / trackedUsers : 0,
      minutesPerJob: totalJobs > 0 ? totalMinutes / totalJobs : 0,
    },
    coverage: {
      trackedUsers,
      knownUsers,
      includesInactiveUsers,
      note:
        knownUsers > trackedUsers
          ? `Only ${trackedUsers} of ${knownUsers} users generated analytics events in this scope and period.`
          : "Rankings reflect the users who generated analytics activity in the selected scope.",
    },
    peakDay: peakDayEntry
      ? {
          date: peakDayEntry[0],
          totalJobs: peakDayEntry[1],
        }
      : null,
    peakHour: peakHourEntry
      ? {
          hour: peakHourEntry[0],
          totalEvents: peakHourEntry[1],
        }
      : null,
    longestRecording,
  };
}