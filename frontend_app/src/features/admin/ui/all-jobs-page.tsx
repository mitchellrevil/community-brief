import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Filter,
  Grid,
  List,
  RefreshCw,
  Search,
  User,
} from "lucide-react";
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
import { AudioRecordingCard } from "@/features/recordings/ui/AudioRecordingCard";

type Job = {
  id: string;
  user_id: string;
  displayname?: string;
  display_name?: string;
  file_name?: string;
  filename?: string;
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
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  
  // Fetch all jobs (now supports user_id filtering from backend)
  const fetchAllJobs = async () => {
    const offset = (currentPage - 1) * itemsPerPage;
    // Pass user_id to backend if not "all"
    const userId = userFilter !== "all" ? userFilter : undefined;
    return await fetchAllJobsApi(itemsPerPage, offset, userId, search);
  };

  const {
    data: jobsData,
    isLoading,
    error,
    refetch,
  } = useQuery<JobsResponse>({
    queryKey: recordingsKeys.adminAllJobs(currentPage, itemsPerPage, userFilter, search),
    queryFn: fetchAllJobs,
    placeholderData: (previousData) => previousData,
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
            <label className="relative w-full md:w-64">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search recordings"
                className="border-input bg-background h-10 w-full rounded-md border py-2 pr-3 pl-9 text-sm"
                aria-label="Search recordings"
              />
            </label>
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
          <div className="bg-muted/80 inline-flex items-center gap-1 rounded-lg p-1">
            <Button
              type="button"
              variant={viewMode === "card" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setViewMode("card")}
            >
              <Grid className="h-3.5 w-3.5" />
              Cards
            </Button>
            <Button
              type="button"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
              List
            </Button>
          </div>
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
          ) : (            <MotionList
            as="div"
            className={
              viewMode === "card"
                ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
                : "flex flex-col gap-2"
            }
          >
              {filteredJobs.map((job) => (
                <MotionListItem key={job.id} as="div">
                  <JobCard
                    job={job}
                    viewMode={viewMode}
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
  viewMode: "card" | "list";
  userMap: Record<string, { email: string; name?: string }>;
  allJobs: Array<Job>;
  onRetrySuccess?: () => void;
}

function JobCard({ 
  job, 
  viewMode,
  userMap,
  allJobs,
  onRetrySuccess
}: JobCardProps) {
  const { toast } = useToast();
  
  // Determine if job can be retried (not processing)
  const normalizedStatus = job.status?.toLowerCase();
  const canRetry = Boolean(
    normalizedStatus &&
      !["transcribing", "analysing"].includes(normalizedStatus),
  );
  
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
  const handleViewDetails = () => {
    localStorage.setItem("cachedJobs", JSON.stringify(allJobs));
    localStorage.setItem("current_recording_id", job.id);
  };

  return (
    <AudioRecordingCard
      recording={job}
      layout={viewMode}
      isEditable={false}
      ownerLabel={ownerDisplay}
      detailsFrom="all-files"
      onViewDetails={handleViewDetails}
      onRetryProcessing={() => reprocessMutation.mutate(job.id)}
      retryAvailable={canRetry}
      retryPending={reprocessMutation.isPending}
    />
  );
}


