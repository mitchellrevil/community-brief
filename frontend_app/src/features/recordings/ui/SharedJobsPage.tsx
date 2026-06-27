import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeading } from "@/components/ui/page-heading";
import { RecordingCardSkeletonGrid } from "@/components/ui/recording-card-skeleton";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSharedJobs } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { getDisplayName } from "@/lib/display-name-utils";
import { listContainerStagger, listItemFadeInUp } from "@/lib/motion";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  FileAudio,
  Grid,
  List,
  Share2,
  ShieldAlert,
  UserCircle,
  Users,
} from "lucide-react";

export function SharedJobsPage() {
  const breadcrumbs = useBreadcrumbs();
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [filter, setFilter] = useState<"all" | "shared" | "owned">("all");

  const {
    data: sharedJobsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: recordingsKeys.sharedJobs(),
    queryFn: getSharedJobs,
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
                onClick={() => setFilter(id)}
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
              {sharedJobs.length + ownedSharedJobs.length} total shared files
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
  const displayName = getDisplayName(job);

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

  const PermissionBadge = () => {
    // Using simple semantic badges instead of custom colors
    const label =
      userPermission === "owner"
        ? "Owner"
        : userPermission === "admin"
          ? "Admin"
          : userPermission === "edit"
            ? "Editor"
            : "Viewer";

    const variant = userPermission === "owner" ? "secondary" : "outline";

    return (
      <Badge
        variant={variant}
        className="h-5 px-1.5 text-[10px] font-medium tracking-wider uppercase"
      >
        {label}
      </Badge>
    );
  };

  if (viewMode === "list") {
    return (
      <motion.div
        variants={listItemFadeInUp}
        layout
        className="group bg-card hover:bg-muted/40 hover:border-primary/20 flex items-center gap-4 rounded-lg border p-3 transition-colors"
      >
        <div className="bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors">
          <FileAudio className="h-5 w-5" />
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-4 md:grid-cols-12">
          <div className="min-w-0 md:col-span-5">
            <div className="mb-1 flex items-center gap-2">
              <h3
                className="text-foreground group-hover:text-primary cursor-pointer truncate text-sm font-medium transition-colors"
                title={displayName}
              >
                {displayName}
              </h3>
            </div>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span>
                {job.created_at
                  ? formatDistanceToNow(new Date(job.created_at), {
                      addSuffix: true,
                    })
                  : "-"}
              </span>
              {sharingMessage && (
                <span className="bg-muted hidden max-w-[150px] truncate rounded px-1.5 py-0.5 text-[10px] italic md:inline-block">
                  {sharingMessage}
                </span>
              )}
            </div>
          </div>

          <div className="md:col-span-3">
            <div className="flex items-center gap-2">
              <PermissionBadge />
              <StatusBadge
                status={job.status}
                size="sm"
                variant="subtle"
                className="h-5 text-[10px]"
              />
            </div>
          </div>

          <div className="text-muted-foreground text-xs md:col-span-3 md:text-right">
            {!isOwner && (
              <span className="flex items-center justify-end gap-1.5">
                <span className="truncate">by {sharedByDisplay}</span>
                <UserCircle className="text-muted-foreground/70 h-3.5 w-3.5" />
              </span>
            )}
            {isOwner && sharedWithCount !== undefined && (
              <span>Shared with {sharedWithCount} people</span>
            )}
          </div>

          <div className="flex justify-end md:col-span-1">
            <Link
              to="/audio-recordings/$id"
              params={{ id: job.id }}
              search={{ from: "shared" }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-8 w-8"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>
    );
  }

  // Card View
  return (
    <motion.div
      variants={listItemFadeInUp}
      layout
      className="h-full"
      whileHover={{ y: -2, transition: { duration: 0.18 } }}
    >
      <Card className="group border-border/70 from-card to-background/80 hover:from-primary/3 hover:to-background/90 hover:border-primary/30 flex h-full flex-col overflow-hidden bg-gradient-to-br shadow-[0_8px_20px_rgba(0,0,0,0.03)] transition-all duration-200 hover:shadow-[0_14px_30px_rgba(0,0,0,0.06)]">
        <div className="from-primary/70 via-primary/10 h-0.5 w-full bg-gradient-to-r to-transparent opacity-70" />

        <CardContent className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="relative">
              <div className="bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 rounded-lg p-2.5 transition-colors">
                <FileAudio className="h-5 w-5" />
              </div>
              <div className="pointer-events-none absolute -inset-px rounded-lg border border-white/40 bg-gradient-to-tr from-white/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </div>

            <div className="flex flex-col items-end gap-1">
              <PermissionBadge />
              <StatusBadge
                status={job.status}
                size="sm"
                variant="subtle"
                className="h-5 text-[10px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3
              className="text-foreground group-hover:text-primary line-clamp-2 text-sm leading-snug font-semibold transition-colors"
              title={displayName}
            >
              {displayName}
            </h3>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Calendar className="h-3 w-3" />
              {job.created_at
                ? formatDistanceToNow(new Date(job.created_at), {
                    addSuffix: true,
                  })
                : "Unknown"}
            </div>
          </div>

          {sharingMessage && (
            <div className="bg-muted/40 text-muted-foreground border-border/50 relative overflow-hidden rounded-md border p-2.5 text-xs italic">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <p className="relative line-clamp-3">“{sharingMessage}”</p>
            </div>
          )}

          <div className="border-border/40 mt-auto flex items-center justify-between border-t pt-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              {!isOwner ? (
                <>
                  <div className="from-primary/10 to-muted text-foreground ring-border flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-medium ring-1">
                    {sharedByDisplay.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className="max-w-[120px] truncate"
                    title={sharedByDisplay}
                  >
                    {sharedByDisplay}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  {sharedWithCount} recipient{sharedWithCount === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <Link
              to="/audio-recordings/$id"
              params={{ id: job.id }}
              search={{ from: "shared" }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="group/cta h-7 gap-1 px-2 text-xs"
              >
                <span>Open</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/cta:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
