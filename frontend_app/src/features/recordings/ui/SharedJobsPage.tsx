import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  Grid,
  List,
  Search,
  Share2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeading } from "@/components/ui/page-heading";
import { EnhancedPagination } from "@/components/ui/pagination";
import { RecordingCardSkeletonGrid } from "@/components/ui/recording-card-skeleton";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { getSharedJobs } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { AudioRecordingCard } from "@/features/recordings/ui/AudioRecordingCard";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { listContainerStagger, listItemFadeInUp } from "@/lib/motion";

export function SharedJobsPage() {
  const breadcrumbs = useBreadcrumbs();
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [filter, setFilter] = useState<"all" | "shared" | "owned">("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const {
    data: sharedJobsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: recordingsKeys.sharedJobs(currentPage, pageSize, search, filter),
    queryFn: () =>
      getSharedJobs({
        search: search || undefined,
        scope: filter,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      }),
    placeholderData: (previousData) => previousData,
    staleTime: 60000,
  });

  const rawSharedJobs = sharedJobsData?.shared_jobs || [];
  const rawOwnedSharedJobs =
    sharedJobsData?.owned_jobs_shared_with_others || [];

  const toEpochMs = (v: any) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.getTime();
    return 0;
  };

  const sharedJobs = [...rawSharedJobs].sort(
    (a, b) =>
      toEpochMs(b.shared_at ?? b.created_at) -
      toEpochMs(a.shared_at ?? a.created_at),
  );

  const ownedSharedJobs = [...rawOwnedSharedJobs].sort(
    (a, b) => toEpochMs(b.created_at) - toEpochMs(a.created_at),
  );
  const totalCount = sharedJobsData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const header = (
    <PageHeading
      icon={<Share2 className="h-5 w-5 sm:h-6 sm:w-6" />}
      title="Shared files"
      breadcrumb={
        <SmartBreadcrumb
          items={[
            { label: "My Files", href: "/audio-recordings" },
            { label: "Shared", isCurrentPage: true },
          ]}
        />
      }
    />
  );

  if (isLoading) {
    return (
      <div className="min-h-screen w-full max-w-full">
        {header}
        <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="bg-muted h-8 w-40 animate-pulse rounded" />
            <div className="bg-muted h-8 w-32 animate-pulse rounded" />
          </div>
          <RecordingCardSkeletonGrid count={6} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full max-w-full">
        {header}
        <div className="mx-auto flex w-full max-w-7xl justify-center px-4 py-4 sm:px-6 sm:py-6">
          <Card className="border-destructive/40 bg-destructive/5 w-full max-w-md">
            <CardContent className="flex flex-col items-center space-y-4 p-6 text-center sm:p-8">
              <div className="bg-destructive/10 rounded-full p-3">
                <ShieldAlert className="text-destructive h-7 w-7 sm:h-8 sm:w-8" />
              </div>
              <div>
                <h3 className="text-foreground text-base font-semibold sm:text-lg">
                  We couldn&apos;t load your shared files
                </h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  {error instanceof Error
                    ? error.message
                    : "Something went wrong."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full">
      {header}

      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 pb-24 sm:space-y-6 sm:px-6 sm:py-6 md:pb-6">
        {/* Controls Bar */}
        <div className="bg-card/60 flex flex-col gap-3 rounded-xl border px-3 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
          <label className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search shared files"
              className="border-input bg-background h-10 w-full rounded-md border py-2 pr-3 pl-9 text-sm"
              aria-label="Search shared files"
            />
          </label>
          {/* Filter Tabs */}
          <div className="bg-muted/80 grid grid-cols-3 gap-1 rounded-lg p-1 sm:inline-flex sm:items-center sm:gap-1">
            {(
              [
                { id: "all", label: "All shared files" },
                { id: "shared", label: "Shared with you" },
                { id: "owned", label: "Shared by you" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFilter(id);
                  setCurrentPage(1);
                }}
                className={clsx(
                  "relative rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors sm:px-4 sm:text-sm",
                  filter === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="sm:hidden">
                  {id === "all"
                    ? "All"
                    : id === "shared"
                      ? "With you"
                      : "By you"}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-muted-foreground hidden text-xs sm:block">
              {totalCount} total shared files
            </p>
            <div className="bg-muted/80 inline-flex items-center gap-1 rounded-lg p-1">
              <Button
                type="button"
                variant={viewMode === "card" ? "secondary" : "ghost"}
                size="sm"
                className={clsx(
                  "h-8 px-3 text-xs",
                  viewMode === "card" && "bg-background shadow-xs",
                )}
                onClick={() => setViewMode("card")}
              >
                <Grid className="mr-1.5 h-3.5 w-3.5" />
                Cards
              </Button>
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className={clsx(
                  "h-8 px-3 text-xs",
                  viewMode === "list" && "bg-background shadow-xs",
                )}
                onClick={() => setViewMode("list")}
              >
                <List className="mr-1.5 h-3.5 w-3.5" />
                List
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-10 sm:space-y-12">
          <AnimatePresence mode="popLayout">
            {(filter === "all" || filter === "shared") && (
              <motion.section
                key="shared-section"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
              >
                {sharedJobs.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="Nothing shared with you yet"
                    description="When someone shares a recording with you, it will show up here."
                  />
                ) : (
                  <motion.div
                    variants={listContainerStagger}
                    initial="hidden"
                    animate="visible"
                    className={
                      viewMode === "card"
                        ? "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
                        : "flex flex-col gap-2.5"
                    }
                  >
                    {sharedJobs.map((job) => (
                      <SharedJobCard
                        key={job.id}
                        job={job}
                        isOwner={false}
                        viewMode={viewMode}
                      />
                    ))}
                  </motion.div>
                )}
              </motion.section>
            )}

            {(filter === "all" || filter === "owned") && (
              <motion.section
                key="owned-section"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{
                  duration: 0.2,
                  delay: filter === "all" ? 0.05 : 0,
                }}
              >
                {filter === "all" && (
                  <div className="border-border/60 my-2 border-t" />
                )}

                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary rounded-full p-2">
                      <Share2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-tight sm:text-lg">
                        Files you&apos;ve shared
                      </h2>
                      <p className="text-muted-foreground text-xs sm:text-sm">
                        Recordings that other people can access from your
                        account.
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="self-start rounded-full px-3 py-1 font-mono text-xs"
                  >
                    {ownedSharedJobs.length}&nbsp;items
                  </Badge>
                </div>

                {ownedSharedJobs.length === 0 ? (
                  <EmptyState
                    icon={Share2}
                    title="You haven't shared anything yet"
                    description="Share a recording from the Files page to see it listed here."
                  />
                ) : (
                  <motion.div
                    variants={listContainerStagger}
                    initial="hidden"
                    animate="visible"
                    className={
                      viewMode === "card"
                        ? "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
                        : "flex flex-col gap-2.5"
                    }
                  >
                    {ownedSharedJobs.map((job) => (
                      <SharedJobCard
                        key={job.id}
                        job={job}
                        isOwner={true}
                        viewMode={viewMode}
                      />
                    ))}
                  </motion.div>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <EnhancedPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalCount}
          itemsPerPage={pageSize}
          onPageChange={(page) => {
            setCurrentPage(page);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <div className="border-muted-foreground/25 bg-muted/10 rounded-xl border border-dashed p-12 text-center">
      <div className="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full shadow-sm">
        <Icon className="text-muted-foreground h-6 w-6" />
      </div>
      <h3 className="text-foreground mb-1 text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground mx-auto max-w-xs text-sm">
        {description}
      </p>
    </div>
  );
}

interface SharedJobCardProps {
  job: any;
  isOwner: boolean;
  viewMode: "card" | "list";
}

function SharedJobCard({ job, isOwner, viewMode }: SharedJobCardProps) {
  // Get user's permission for this job
  const userShare =
    !isOwner &&
    job.shared_with?.find(
      (share: any) =>
        share.user_id === localStorage.getItem("user_id") ||
        share.user_email === localStorage.getItem("email"),
    );

  const userPermission = isOwner
    ? "owner"
    : job.permission_level || userShare?.permission_level || "view";

  const sharingMessage = !isOwner ? job.message || userShare?.message : null;

  // Attempt to resolve a display name for the sharer
  const resolveSharerName = () => {
    if (isOwner) return "You";

    // Check for explicit name fields if the API provides them (optimistic)
    const nameFromJob =
      job.shared_by_name || job.sharer_name || job.shared_by_display_name;
    if (nameFromJob) return nameFromJob;

    // Fallback to email processing
    const email =
      job.shared_by_email ||
      job.shared_with?.[0]?.user_email ||
      userShare?.user_email;
    if (!email) return "Unknown";

    // Format email: john.doe@example.com -> volatile logic but better than raw email
    // If it looks like a proper name email
    if (email.includes("@")) {
      const prefix = email.split("@")[0];
      // simplistic "John.Doe" -> "John Doe"
      const formatted = prefix
        .replace(/[._]/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      return formatted;
    }
    return email;
  };

  const sharedByDisplay = resolveSharerName();

  const sharedWithCount = isOwner
    ? typeof job.shared_with_count === "number"
      ? job.shared_with_count
      : (job.shared_with?.length ?? 0)
    : undefined;

  return (
    <motion.div
      variants={listItemFadeInUp}
      layout
      className={viewMode === "card" ? "h-full" : undefined}
    >
      <AudioRecordingCard
        recording={job}
        layout={viewMode}
        isEditable={false}
        accessLabel={formatPermission(userPermission)}
        ownerLabel={!isOwner ? sharedByDisplay : undefined}
        sharingLabel={
          isOwner && sharedWithCount !== undefined
            ? `${sharedWithCount} recipient${sharedWithCount === 1 ? "" : "s"}`
            : undefined
        }
        message={sharingMessage}
        detailsFrom="shared"
      />
    </motion.div>
  );
}

function formatPermission(permission: string) {
  return permission === "owner"
    ? "Owner"
    : permission === "admin"
      ? "Admin"
      : permission === "edit"
        ? "Editor"
        : "Viewer";
}
