import { useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function useRecordingNavigationGuard(hasPendingRecording: boolean) {
  const [backBlocked, setBackBlocked] = useState(false);
  const blocker = useBlocker({
    shouldBlockFn: () => hasPendingRecording,
    enableBeforeUnload: hasPendingRecording,
    withResolver: true,
  });
  const dismiss = () => {
    setBackBlocked(false);
    if (blocker.status === "blocked") blocker.reset();
  };
  return {
    guardBack: (onBack: () => void) => {
      if (hasPendingRecording) setBackBlocked(true);
      else onBack();
    },
    navigationDialog: (
      <AlertDialog open={backBlocked || blocker.status === "blocked"} onOpenChange={(open) => { if (!open) dismiss(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload your recording before leaving</AlertDialogTitle>
            <AlertDialogDescription>
              Your recording has not been submitted. Stay here to finish recording
              and upload it. If you are offline, submit it to save it in the upload
              queue. A local draft is not an upload.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={dismiss}>Stay with recording</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };
}
