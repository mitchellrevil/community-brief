import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ClipboardList,
  Clock,
  FileAudio,
  Filter,
  Loader2,
  RefreshCw,
  RotateCw,
  User,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { PageHeading } from "@/components/ui/page-heading";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { useToast } from "@/components/ui/use-toast";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminReprocessJob, fetchAllJobsApi } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { UserSelect } from "@/features/users/ui/UserSelect";
import { StatusBadge } from "@/components/ui/status-badge";
import { RecordingCardSkeletonGrid } from "@/components/ui/recording-card-skeleton";
import { EnhancedPagination } from "@/components/ui/pagination";

type Job = {
  id: string;
  user_id: string;
  file_name?: string;
  file_path?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  user_email?: string;
  deleted?: boolean;
};

type JobsResponse = {
  status: string;
  jobs: Array<Job>;
  total_count?: number;
};

export function AdminAllJobsPage() {
  const breadcrumbs = useBreadcrumbs();
  const [userFilter, setUserFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  // Fetch all jobs (now supports user_id filtering from backend)
  const fetchAllJobs = async () => {
    const offset = (currentPage - 1) * itemsPerPage;
    // Pass user_id to backend if not "all"
    const userId = userFilter !== "all" ? userFilter : undefined;
    return await fetchAllJobsApi(itemsPerPage, offset, userId);
  };

  const {
    data: jobsData,
    isLoading,
    error,
    refetch,
  } = useQuery<JobsResponse>({
    queryKey: recordingsKeys.adminAllJobs(currentPage, itemsPerPage, userFilter),
    queryFn: fetchAllJobs,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Build a map of user IDs to user information for displaying user details
  // Note: We no longer pre-fetch all users since UserSelect handles that
  const userMap = useMemo(() => {
    // Build from jobs data if user info is embedded
    const map: Record<string, { email: string, name?: string }> = {};
    if (jobsData?.jobs) {
      jobsData.jobs.forEach(job => {
        if (job.user_id && job.user_email) {
          map[job.user_id] = { 
            email: job.user_email,
            name: undefined
          };
        }
      });
    }
    return map;
  }, [jobsData]);

  // Filter jobs by status only (user filtering is now handled by backend)
  const filteredJobs = useMemo(() => {
    if (!jobsData?.jobs) return [];
    
    const jobs = jobsData.jobs;
    
    return jobs.filter(job => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      return matchesStatus && !job.deleted; // Exclude soft-deleted jobs
    });
  }, [jobsData?.jobs, statusFilter]);

  const header = (
    <PageHeading
      icon={<ClipboardList className="h-6 w-6" />}
      title="All Recordings"
      breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
    />
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {header}
          <RecordingCardSkeletonGrid count={9} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <p className="text-destructive">Failed to load recordings</p>
              <p className="text-sm text-muted-foreground mt-2">
                {(error).message}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const allJobs = jobsData?.jobs.filter(job => !job.deleted) || [];
  
  // Get unique statuses for the filter
  const uniqueStatuses = [...new Set(allJobs.map(job => job.status).filter(Boolean))];

  return (
    <div className="min-h-screen bg-background">
      {header}

      {/* Filters */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <User className="h-4 w-4 text-muted-foreground" />
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
            
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter by status:</span>
              <Select 
                value={statusFilter} 
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {uniqueStatuses.filter((status): status is string => typeof status === "string").map((status: string) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          {filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="text-lg font-medium mb-2">No recordings found</h3>
                <p className="text-muted-foreground">
                  {userFilter === "all" && statusFilter === "all"
                    ? "There are no recordings in the system." 
                    : "No recordings found matching the selected filters."}
                </p>
              </CardContent>
            </Card>
          ) : (            <MotionList as="div" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredJobs.map((job) => (
                <MotionListItem key={job.id} as="div">
                  <JobCard
                    job={job}
                    userMap={userMap}
                    allJobs={filteredJobs}
                    onRetrySuccess={refetch}
                  />
                </MotionListItem>
              ))}
            </MotionList>
          )}
        </div>

        {/* Pagination */}
        {jobsData && (
          <div className="mt-6">
            <EnhancedPagination
              currentPage={currentPage}
              totalPages={Math.ceil((jobsData.total_count || jobsData.jobs.length) / itemsPerPage)}
              totalItems={jobsData.total_count || jobsData.jobs.length}
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
  );
}

interface JobCardProps {
  job: Job;
  userMap: Record<string, { email: string; name?: string }>;
  allJobs: Array<Job>;
  onRetrySuccess?: () => void;
}

function JobCard({ 
  job, 
  userMap,
  allJobs,
  onRetrySuccess
}: JobCardProps) {
  const { toast } = useToast();
  
  // Determine if job can be retried (not processing)
  const canRetry = job.status && !["transcribing", "analysing"].includes(job.status);
  
  // Create retry mutation
  const reprocessMutation = useMutation({
    mutationFn: (jobId: string) => adminReprocessJob(jobId),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Retry scheduled successfully",
        variant: "default",
      });
      onRetrySuccess?.();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || error?.message || "Failed to retry processing";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Get user display info from the map
  const ownerInfo = job.user_id ? userMap[job.user_id] : null;
  const ownerDisplay = ownerInfo
    ? ownerInfo.name || ownerInfo.email
    : job.user_email || "Unknown user";

  return (
    <Card className="bg-card/90 border border-border/60 hover:border-border hover:shadow-lg transition-all duration-200 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-base font-medium truncate">
              {job.file_name || "Unknown Recording"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <StatusBadge
                status={(job.status ?? "default") as "completed" | "processing" | "uploaded" | "failed" | "error" | "default"}
                animate={job.status === "processing" || job.status === "analysing" || job.status === "transcribing"}
              />
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
            <Clock className="h-3 w-3" />
            Updated: {job.updated_at ? 
              formatDistanceToNow(new Date(job.updated_at), { addSuffix: true }) :
              "Unknown date"
            }
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            Owner: <span className="font-medium">{ownerDisplay}</span>
          </div>
        </div>        {/* View Details and Retry Links */}        <div className="flex gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 w-full"            onClick={() => {
              // Store all jobs data in localStorage for access on detail page
              localStorage.setItem("cachedJobs", JSON.stringify(allJobs));
              localStorage.setItem("current_recording_id", job.id);
              window.location.href = `/audio-recordings/${job.id}`;
            }}
          >
            View Details
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canRetry || reprocessMutation.isPending}
            onClick={() => reprocessMutation.mutate(job.id)}
            className="flex items-center gap-1"
            title={!canRetry ? "Cannot retry jobs that are currently processing" : "Retry processing this job"}
          >
            {reprocessMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
              </>
            ) : (
              <>
                <RotateCw className="h-4 w-4" />
                Retry
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


