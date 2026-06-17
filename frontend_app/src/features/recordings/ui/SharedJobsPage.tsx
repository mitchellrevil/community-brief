import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { clsx } from "clsx";

import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { PageHeading } from "@/components/ui/page-heading";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { getDisplayName } from "@/lib/display-name-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSharedJobs } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { StatusBadge } from "@/components/ui/status-badge";
import { RecordingCardSkeletonGrid } from "@/components/ui/recording-card-skeleton";
import { listContainerStagger, listItemFadeInUp } from "@/lib/motion";

export function SharedJobsPage() {
  const breadcrumbs = useBreadcrumbs();
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [filter, setFilter] = useState<'all' | 'shared' | 'owned'>('all');
  
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
  const rawOwnedSharedJobs = sharedJobsData?.owned_jobs_shared_with_others || [];

  const toEpochMs = (v: any) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.getTime();
    return 0;
  };

  const sharedJobs = [...rawSharedJobs].sort((a, b) =>
    (toEpochMs(b.shared_at ?? b.created_at) - toEpochMs(a.shared_at ?? a.created_at))
  );

  const ownedSharedJobs = [...rawOwnedSharedJobs].sort(
    (a, b) => toEpochMs(b.created_at) - toEpochMs(a.created_at)
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
      <div className="w-full max-w-full min-h-screen">
        {header}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="h-8 w-40 bg-muted rounded animate-pulse" />
            <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          </div>
          <RecordingCardSkeletonGrid count={6} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-full min-h-screen">
        {header}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex justify-center">
          <Card className="max-w-md w-full border-destructive/40 bg-destructive/5">
            <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center space-y-4">
              <div className="p-3 bg-destructive/10 rounded-full">
                <ShieldAlert className="h-7 w-7 sm:h-8 sm:w-8 text-destructive" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">
                  We couldn&apos;t load your shared files
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  {error instanceof Error ? error.message : 'Something went wrong.'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-h-screen">
      {header}

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-24 md:pb-6">

      {/* Controls Bar */}
      <div className="rounded-xl border bg-card/60 backdrop-blur-sm px-3 py-3 sm:px-4 sm:py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter Tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/80 p-1 sm:inline-flex sm:items-center sm:gap-1">
          {([
            { id: 'all', label: 'All shared files' },
            { id: 'shared', label: 'Shared with you' },
            { id: 'owned', label: 'Shared by you' },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={clsx(
                "relative px-2 sm:px-4 py-1.5 text-[11px] sm:text-sm rounded-md font-medium transition-colors",
                filter === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="sm:hidden">
                {id === 'all' ? 'All' : id === 'shared' ? 'With you' : 'By you'}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="hidden sm:block text-xs text-muted-foreground">
            {sharedJobs.length + ownedSharedJobs.length} total shared files
          </p>
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted/80 p-1">
            <Button
              type="button"
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              className={clsx(
                "h-8 px-3 text-xs",
                viewMode === 'card' && "bg-background shadow-xs"
              )}
              onClick={() => setViewMode('card')}
            >
              <Grid className="h-3.5 w-3.5 mr-1.5" />
              Cards
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className={clsx(
                "h-8 px-3 text-xs",
                viewMode === 'list' && "bg-background shadow-xs"
              )}
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5 mr-1.5" />
              List
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-10 sm:space-y-12">
        <AnimatePresence mode="popLayout">
          {(filter === 'all' || filter === 'shared') && (
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
                    viewMode === 'card'
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5'
                      : 'flex flex-col gap-2.5'
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

          {(filter === 'all' || filter === 'owned') && (
            <motion.section
              key="owned-section"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, delay: filter === 'all' ? 0.05 : 0 }}
            >
              {filter === 'all' && (
                <div className="my-2 border-t border-border/60" />
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold tracking-tight">
                      Files you&apos;ve shared
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Recordings that other people can access from your account.
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="self-start rounded-full px-3 py-1 text-xs font-mono"
                >
                  {ownedSharedJobs.length}&nbsp;items
                </Badge>
              </div>

              {ownedSharedJobs.length === 0 ? (
                <EmptyState
                  icon={Share2}
                  title="You haven&apos;t shared anything yet"
                  description="Share a recording from the Files page to see it listed here."
                />
              ) : (
                <motion.div
                  variants={listContainerStagger}
                  initial="hidden"
                  animate="visible"
                  className={
                    viewMode === 'card'
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5'
                      : 'flex flex-col gap-2.5'
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

function EmptyState({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-muted/10 p-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        {description}
      </p>
    </div>
  );
}

interface SharedJobCardProps {
  job: any;
  isOwner: boolean;
  viewMode: 'card' | 'list';
}

function SharedJobCard({ job, isOwner, viewMode }: SharedJobCardProps) {
  const displayName = getDisplayName(job);

  // Get user's permission for this job
  const userShare = !isOwner && job.shared_with?.find((share: any) =>
    share.user_id === localStorage.getItem("user_id") ||
    share.user_email === localStorage.getItem("email")
  );

  const userPermission = isOwner
    ? "owner"
    : job.permission_level || userShare?.permission_level || "view";

  const sharingMessage = !isOwner ? (job.message || userShare?.message) : null;

  // Attempt to resolve a display name for the sharer
  const resolveSharerName = () => {
    if (isOwner) return "You";
    
    // Check for explicit name fields if the API provides them (optimistic)
    const nameFromJob = job.shared_by_name || job.sharer_name || job.shared_by_display_name;
    if (nameFromJob) return nameFromJob;

    // Fallback to email processing
    const email = job.shared_by_email || job.shared_with?.[0]?.user_email || userShare?.user_email;
    if (!email) return "Unknown";

    // Format email: john.doe@example.com -> volatile logic but better than raw email
    // If it looks like a proper name email
    if (email.includes('@')) {
      const prefix = email.split('@')[0];
      // simplistic "John.Doe" -> "John Doe"
      const formatted = prefix
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      return formatted;
    }
    return email;
  };

  const sharedByDisplay = resolveSharerName();
  
  const sharedWithCount = isOwner
    ? (typeof job.shared_with_count === 'number' ? job.shared_with_count : job.shared_with?.length ?? 0)
    : undefined;

  const PermissionBadge = () => {
    // Using simple semantic badges instead of custom colors
    const label = userPermission === "owner" ? "Owner" :
                  userPermission === "admin" ? "Admin" :
                  userPermission === "edit" ? "Editor" : "Viewer";

    const variant = userPermission === "owner" ? "secondary" : "outline";
    
    return (
      <Badge variant={variant} className="text-[10px] px-1.5 h-5 font-medium uppercase tracking-wider">
        {label}
      </Badge>
    );
  };

  if (viewMode === 'list') {
    return (
      <motion.div 
        variants={listItemFadeInUp} 
        layout
        className="group flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/40 hover:border-primary/20 transition-colors"
      >
         <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
          <FileAudio className="h-5 w-5" />
        </div>
        
        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-5 min-w-0">
             <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-sm truncate text-foreground group-hover:text-primary transition-colors cursor-pointer" title={displayName}>
                  {displayName}
                </h3>
             </div>
             <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{job.created_at ? formatDistanceToNow(new Date(job.created_at), { addSuffix: true }) : "-"}</span>
                {sharingMessage && <span className="hidden md:inline-block px-1.5 py-0.5 rounded bg-muted text-[10px] italic truncate max-w-[150px]">{sharingMessage}</span>}
             </div>
          </div>

          <div className="md:col-span-3">
             <div className="flex items-center gap-2">
               <PermissionBadge />
               <StatusBadge status={job.status} size="sm" variant="subtle" className="text-[10px] h-5" />
             </div>
          </div>

          <div className="md:col-span-3 text-xs text-muted-foreground md:text-right">
             {!isOwner && (
               <span className="flex items-center justify-end gap-1.5">
                 <span className="truncate">by {sharedByDisplay}</span>
                 <UserCircle className="h-3.5 w-3.5 text-muted-foreground/70" />
               </span>
             )}
             {isOwner && sharedWithCount !== undefined && (
               <span>Shared with {sharedWithCount} people</span>
             )}
          </div>
          
          <div className="md:col-span-1 flex justify-end">
             <Link to="/audio-recordings/$id" params={{ id: job.id }}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
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
      <Card className="group h-full flex flex-col overflow-hidden border-border/70 bg-gradient-to-br from-card to-background/80 hover:from-primary/3 hover:to-background/90 hover:border-primary/30 shadow-[0_8px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_14px_30px_rgba(0,0,0,0.06)] transition-all duration-200">
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/70 via-primary/10 to-transparent opacity-70" />

        <CardContent className="p-4 flex flex-col flex-1 gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="relative">
              <div className="p-2.5 rounded-lg bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <FileAudio className="h-5 w-5" />
              </div>
              <div className="pointer-events-none absolute -inset-px rounded-lg border border-white/40 bg-gradient-to-tr from-white/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div className="flex flex-col items-end gap-1">
              <PermissionBadge />
              <StatusBadge
                status={job.status}
                size="sm"
                variant="subtle"
                className="text-[10px] h-5"
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3
              className="font-semibold text-sm leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2"
              title={displayName}
            >
              {displayName}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {job.created_at
                ? formatDistanceToNow(new Date(job.created_at), { addSuffix: true })
                : "Unknown"}
            </div>
          </div>

          {sharingMessage && (
            <div className="bg-muted/40 p-2.5 rounded-md text-xs text-muted-foreground italic border border-border/50 relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="relative line-clamp-3">“{sharingMessage}”</p>
            </div>
          )}

          <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/40">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {!isOwner ? (
                <>
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/10 to-muted flex items-center justify-center text-[11px] font-medium text-foreground ring-1 ring-border">
                    {sharedByDisplay.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className="truncate max-w-[120px]"
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

            <Link to="/audio-recordings/$id" params={{ id: job.id }}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 group/cta"
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



