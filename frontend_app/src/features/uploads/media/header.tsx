import { Mic, Upload } from "lucide-react";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { PageHeading } from "@/components/ui/page-heading";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { Button } from "@/components/ui/button";

interface MediaUploadHeaderProps {
  onStartRecording?: () => void;
  isRecording?: boolean;
}

export function MediaUploadHeader({ onStartRecording, isRecording = false }: MediaUploadHeaderProps) {
  const breadcrumbs = useBreadcrumbs();

  return (
    <PageHeading
      icon={<Upload className="h-6 w-6" />}
      title="Media upload"
      breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
      actions={onStartRecording ? (
        <Button onClick={onStartRecording} disabled={isRecording} size="sm" variant="outline">
          <Mic className={`h-4 w-4 mr-2 ${isRecording ? "text-red-500" : ""}`} />
          {isRecording ? "Recording..." : "Start Recording"}
        </Button>
      ) : undefined}
    />
  );
}
