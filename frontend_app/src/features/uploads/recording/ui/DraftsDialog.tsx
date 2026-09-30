import type { DraftRecording } from "@/lib/draft-storage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/lib/draft-storage";

interface DraftsDialogProps {
  open: boolean;
  drafts: Array<DraftRecording> | null;
  onOpenChange: (open: boolean) => void;
  onRestore: (draft: DraftRecording) => void;
  onDiscard: (draft: DraftRecording) => void;
}

export function DraftsDialog({
  open,
  drafts,
  onOpenChange,
  onRestore,
  onDiscard,
}: DraftsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Unsubmitted Drafts Found</DialogTitle>
          <DialogDescription>
            We found one or more unsaved recordings. You can restore a draft to review and submit it, or discard it if you don't need it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {drafts?.map((draft) => (
            <div key={draft.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {draft.categoryName} - {draft.subcategoryName}
                </div>
                <div className="text-xs text-muted-foreground">
                  Saved {new Date(draft.timestamp).toLocaleString()} - {formatBytes(draft.audioBlob.size + (draft.continuationBlob?.size ?? 0))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => onRestore(draft)}>
                  Review & Restore
                </Button>
                <Button variant="outline" size="sm" onClick={() => onDiscard(draft)}>
                  Discard
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
