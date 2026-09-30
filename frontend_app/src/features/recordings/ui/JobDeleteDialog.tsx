import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { fileToasts } from "@/lib/toast-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { restoreJob, softDeleteJob } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { useUndoManager } from "@/hooks/useUndoManager";

interface JobDeleteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle?: string;
  onDeleteSuccess?: () => void;
}

export function JobDeleteDialog({
  isOpen,
  onOpenChange,
  jobId,
  jobTitle = "Recording",
  onDeleteSuccess,
}: JobDeleteDialogProps) {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const { registerOperation } = useUndoManager({ defaultTimeout: 10000 });

  const deleteJobMutation = useMutation({
    mutationFn: () => softDeleteJob(jobId),
    onSuccess: () => {
      // Register undo operation
      const undoDelete = registerOperation({
        id: `delete-job-${jobId}`,
        execute: async () => {
          // Nothing to do - delete already happened
          console.log(`Delete finalized for ${jobId}`);
          return Promise.resolve();
        },
        revert: async () => {
          // Call restore API to undo
          await restoreJob(jobId);
          // Restore in UI - invalidate all job-related caches
          queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
          queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });
          queryClient.invalidateQueries({ queryKey: recordingsKeys.sharedJobs() });
          toast.success(`${jobTitle} restored`);
        },
        timeout: 10000,
        onExecute: () => console.log(`Delete finalized for ${jobId}`),
        onUndo: () => console.log(`Delete undone for ${jobId}`),
        onError: (error) => {
          console.error(`Failed to restore ${jobId}:`, error);
          toast.error("Failed to restore recording");
        }
      });

      // Show toast with undo option
      fileToasts.deleted(jobTitle, {
        onUndo: undoDelete,
      });

      // Invalidate all job-related caches
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.sharedJobs() });

      // Call the optional success callback
      if (onDeleteSuccess) {
        onDeleteSuccess();
      }
    },
    onError: (error) => {
      toast.error(`Failed to delete ${jobTitle}`, {
        description: error.message,
        action: {
          label: "View Details",
          onClick: () => {
            console.error("Delete error:", error);
          }
        }
      });
      // Make sure we reset the deleting state in case of error
      setIsDeleting(false);
    },
    onSettled: () => {
      setIsDeleting(false);
    },
  });

  const handleDelete = () => {
    setIsDeleting(true);

    // Close dialog immediately
    onOpenChange(false);

    // Execute delete immediately
    deleteJobMutation.mutate();
  };
  return (
    <AlertDialog 
      open={isOpen} 
      onOpenChange={(open) => {
        // Prevent dialog state changes while deletion is in progress
        if (isDeleting && !open) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <AlertDialogTitle>Delete Recording</AlertDialogTitle>
              <AlertDialogDescription className="text-left">
                Are you sure you want to delete "{jobTitle}"?
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // Prevent default to handle deletion manually
              handleDelete();
            }}
            disabled={isDeleting}
            className="bg-destructive text-white font-medium hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="text-white">Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                <span className="text-white">Delete Recording</span>
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


