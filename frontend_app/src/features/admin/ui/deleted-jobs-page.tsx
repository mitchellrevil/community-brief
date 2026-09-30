import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  FileAudio,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  User,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { PageHeading } from "@/components/ui/page-heading";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getDeletedJobs, permanentDeleteJob, restoreJob } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { UserSelect } from "@/features/users/ui/UserSelect";
import { StatusBadge } from "@/components/ui/status-badge";
import { EnhancedPagination } from "@/components/ui/pagination";
import { RecordingCardSkeletonGrid } from "@/components/ui/recording-card-skeleton";

type DeletedJob = {
  id: string;
  user_id: string;
  deleted_by: string;
  file_name?: string;
  file_path?: string;
  status?: string;
  created_at?: string;
  deleted_at?: string;
  user_email?: string;
  transcription_file_path?: string;
  analysis_file_path?: string;
};

type DeletedJobsResponse = {
  status: string;
  message: string;
  count: number;
  jobs: Array<DeletedJob>;
  total_count?: number;
};

export function AdminDeletedJobsPage() {
  const breadcrumbs = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [userFilter, setUserFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  const {
    data: deletedJobsData,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<DeletedJobsResponse>({
    queryKey: recordingsKeys.deletedJobs(currentPage, itemsPerPage, userFilter),
    queryFn: async () => {
      const offset = (currentPage - 1) * itemsPerPage;
      // Pass user_id to backend if not "all"
      const userId = userFilter !== "all" ? userFilter : undefined;
      const result: unknown = await getDeletedJobs(itemsPerPage, offset, userId);
      // Ensure result matches DeletedJobsResponse shape
        if (
          result &&
          typeof result === "object" &&
          "count" in result &&
          ("jobs" in result || "records" in result || "deleted_jobs" in result)
        ) {
          const payload = result as any;
          // If the API returns 'records' instead of 'jobs', map it accordingly
          if ("records" in result && !("jobs" in result)) {
            return {
              status: payload.status,
              message: payload.message,
              count: Array.isArray(payload.records) ? payload.records.length : 0,
              jobs: Array.isArray(payload.records) ? payload.records : [],
            };
          }

          // If the API returns 'deleted_jobs' (admin endpoint), map it to 'jobs'
          if ("deleted_jobs" in result && !("jobs" in result)) {
            return {
              status: payload.status,
              message: payload.message,
              count: Array.isArray(payload.deleted_jobs) ? payload.deleted_jobs.length : 0,
              jobs: Array.isArray(payload.deleted_jobs) ? payload.deleted_jobs : [],
              total_count: payload.total_count,
            };
          }

          return result as DeletedJobsResponse;
        }
      // Fallback: transform result to DeletedJobsResponse if needed
      const payload = result as any;
      return {
        status: payload.status,
        message: payload.message,
        count: Array.isArray(payload.jobs) ? payload.jobs.length : 0,
        jobs: Array.isArray(payload.jobs) ? payload.jobs : [],
        total_count: payload.total_count,
      };
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  const restoreJobMutation = useMutation({
    mutationFn: restoreJob,
    onSuccess: (_, jobId) => {
      toast.success("Job restored successfully!");
      // Invalidate all job-related caches
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.deletedJobs() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.adminAllJobs() });
    },
    onError: (error: Error) => {
      toast.error(`Failed to restore job: ${error.message}`);
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: permanentDeleteJob,
    onSuccess: (_, jobId) => {
      toast.success("Job permanently deleted!");
      // Invalidate all job-related caches
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.deletedJobs() });
    },
    onError: (error: Error) => {
      toast.error(`Failed to permanently delete job: ${error.message}`);
    },
  });

  // Unified deleted jobs array (support both `jobs` and `deleted_jobs` keys)
  const deletedJobs: Array<DeletedJob> = (deletedJobsData as any)?.jobs || (deletedJobsData as any)?.deleted_jobs || [];

  // Build a map of user IDs to user information for displaying user details
  // Note: We no longer pre-fetch all users since UserSelect handles that
  const userMap = useMemo(() => {
    // Build from jobs data if user info is embedded
    const map: Partial<Record<string, { email: string, name?: string }>> = {};
    deletedJobs.forEach(job => {
      if (job.user_id && job.user_email) {
        map[job.user_id] = { 
          email: job.user_email,
          name: undefined
        };
      }
      if (job.deleted_by) {
        // Try to get info from job if available
        map[job.deleted_by] = map[job.deleted_by] ?? { email: "Unknown", name: undefined };
      }
    });
    return map as Record<string, { email: string, name?: string }>;
  }, [deletedJobs]);

  // Filter deleted jobs by user (backend now handles this, so we just pass through)
  const filteredDeletedJobs = useMemo(() => {
    if (deletedJobs.length === 0) return [];
    // No client-side filtering needed since backend handles user filtering
    return deletedJobs;
  }, [deletedJobs]);

  // Debug logging to help diagnose why items might not render
  useEffect(() => {
     
    console.debug('AdminDeletedJobsPage: deletedJobsData keys', deletedJobsData ? Object.keys(deletedJobsData) : 'no-data');
     
    console.debug('AdminDeletedJobsPage: deletedJobs length', deletedJobs.length, 'filtered length', filteredDeletedJobs.length, 'userFilter', userFilter);
  }, [deletedJobsData, deletedJobs, filteredDeletedJobs, userFilter]);

  const header = (
    <PageHeading
      icon={<Trash2 className="h-6 w-6" />}
      title="Deleted Recordings"
      breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
    />
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
        {header}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <RecordingCardSkeletonGrid count={9} />
        </div>
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
        {header}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <p className="text-destructive">Failed to load deleted recordings</p>
              <p className="text-sm text-muted-foreground mt-2">
                {queryError.message}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const totalCount = deletedJobsData ? (deletedJobsData.total_count ?? deletedJobsData.count) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      {header}

      {/* Filters */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-md p-4 md:p-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filter by user:</span>
            <UserSelect
              value={userFilter}
              onValueChange={(value) => {
                setUserFilter(value);
                setCurrentPage(1);
              }}
              placeholder="Select user"
              includeAllOption={true}
              allOptionLabel="All Users"
            />
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              setCurrentPage(1);
              refetch();
            }} 
            className="flex items-center gap-2 w-full md:w-auto"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        
        <div className="space-y-6">
          {filteredDeletedJobs.length === 0 ? (
            <Card className="bg-card/90 border border-border/60 backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <Trash2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="text-lg font-medium mb-2">No deleted recordings found</h3>
                <p className="text-muted-foreground">
                  {userFilter === "all" 
                    ? "There are no deleted recordings in the system." 
                    : "No deleted recordings found for the selected user."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <MotionList as="div" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDeletedJobs.map((job) => (
                <MotionListItem key={job.id} as="div">
                  <DeletedJobCard
                    job={job}
                    userMap={userMap}
                    onRestore={(jobId) => restoreJobMutation.mutate(jobId)}
                    onPermanentDelete={(jobId) => permanentDeleteMutation.mutate(jobId)}
                    isRestoring={restoreJobMutation.isPending}
                    isPermanentDeleting={permanentDeleteMutation.isPending}
                  />
                </MotionListItem>
              ))}
            </MotionList>
          )}
        </div>

        {/* Pagination */}
        {deletedJobsData && (
          <div className="mt-6">
            <EnhancedPagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalCount / itemsPerPage)}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={(page) => {
                setCurrentPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

interface DeletedJobCardProps {
  job: DeletedJob;
  userMap: Record<string, { email: string; name?: string }>;
  onRestore: (jobId: string) => void;
  onPermanentDelete: (jobId: string) => void;
  isRestoring: boolean;
  isPermanentDeleting: boolean;
}

function DeletedJobCard({ 
  job, 
  userMap,
  onRestore, 
  onPermanentDelete, 
  isRestoring, 
  isPermanentDeleting 
}: DeletedJobCardProps) {
  const handleRestore = () => {
    onRestore(job.id);
  };

  const handlePermanentDelete = () => {
    onPermanentDelete(job.id);
  };

  // Get user display info from the map
  const ownerInfo = job.user_id ? userMap[job.user_id] : null;
  const ownerDisplay = ownerInfo
    ? ownerInfo.name || ownerInfo.email
    : job.user_email || "Unknown user";
  
  // Get user who deleted the job
  const deletedByInfo = job.deleted_by ? userMap[job.deleted_by] : null;
  const deletedByDisplay = deletedByInfo
    ? deletedByInfo.name || deletedByInfo.email
    : "Unknown admin";
  return (
    <Card className="bg-card/90 border border-border/60 hover:border-border hover:shadow-lg transition-all duration-200 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-base font-medium truncate">
              {job.file_name || "Unknown Recording"}
            </CardTitle>            <div className="flex items-center gap-2">
              <StatusBadge status={(job.status ?? "default") as "completed" | "processing" | "uploaded" | "failed" | "error" | "default"} animate={job.status === "processing" || job.status === "analysing" || job.status === "transcribing"} />
              <Badge variant="secondary" className="text-xs">
                Deleted
              </Badge>
            </div>
          </div>
          <FileAudio className="h-5 w-5 text-muted-foreground shrink-0" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Job Details */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Created: {job.created_at ? 
              formatDistanceToNow(new Date(job.created_at), { addSuffix: true }) :
              "Unknown date"
            }
          </div>
          <div className="flex items-center gap-1">
            <Trash2 className="h-3 w-3" />
            Deleted: {job.deleted_at ? 
              formatDistanceToNow(new Date(job.deleted_at), { addSuffix: true }) :
              "Unknown date"
            } by <span className="font-medium text-destructive">{deletedByDisplay}</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            Owner: <span className="font-medium">{ownerDisplay}</span>
          </div>
        </div>

        {/* Admin Actions */}
        <div className="flex gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestore}
            disabled={isRestoring || isPermanentDeleting}
            className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            {isRestoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            <span className="ml-1">Restore</span>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isRestoring || isPermanentDeleting}
                className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="ml-1">Permanent</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Permanently Delete Recording
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete "{job.file_name || 'this recording'}"? 
                  This action cannot be undone and all data will be permanently lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handlePermanentDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Permanently Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}


