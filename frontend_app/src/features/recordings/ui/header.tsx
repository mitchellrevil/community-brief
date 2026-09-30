import { Link } from "@tanstack/react-router";
import { FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import PageHeader from "@/components/ui/page-header";

export function AudioRecordingsHeader() {
  return (
    <PageHeader
      title={<h2 className="text-lg md:text-xl font-semibold tracking-tight"> My Files</h2>}
      breadcrumb={<SmartBreadcrumb items={[{ label: "My Files", isCurrentPage: true }]} />}
      description={"Manage and monitor all uploaded audio files and their processing status."}
      right={<Link to="/audio-upload"><Button size="sm" className="px-2 py-1"><FileAudio className="mr-2 h-4 w-4" /><span className="hidden sm:inline">Add New Media File</span></Button></Link>}
    />
  );
}
