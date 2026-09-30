import { Calendar, Clock, FileAudio, User } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";

interface RecentJob {
  id: string;
  job_id?: string;
  user_id: string;
  email?: string;
  timestamp: string;
  file_name?: string;
  audio_duration_minutes?: number;
  prompt_id?: string;
}

interface RecentJobsCardProps {
  jobs: Array<RecentJob>;
  isLoading: boolean;
}

export function RecentJobsCard({ jobs, isLoading }: RecentJobsCardProps) {
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM dd, yyyy HH:mm");
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="bg-card/80 border border-muted-foreground/10 rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent Submitted Jobs
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Latest {jobs.length} jobs submitted in the selected period
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : jobs.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No jobs submitted in the selected period
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Timestamp</th>
                  <th className="text-left py-3 px-4 font-medium">File Name</th>
                  <th className="text-left py-3 px-4 font-medium">User Email</th>
                  <th className="text-right py-3 px-4 font-medium">Duration (min)</th>
                </tr>
              </thead>
              <MotionList as="tbody">
                {jobs.map((job, index) => (
                  <MotionListItem as="tr" key={`${job.id || job.job_id}-${index}`} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatDate(job.timestamp)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 truncate">
                        <FileAudio className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{job.file_name || "—"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {job.email || (job.user_id && job.user_id.substring(0, 8) + "...") || "Unknown User"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {job.audio_duration_minutes ? 
                        job.audio_duration_minutes.toFixed(2) : 
                        "—"
                      }
                    </td>
                  </MotionListItem>
                ))}
              </MotionList>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
