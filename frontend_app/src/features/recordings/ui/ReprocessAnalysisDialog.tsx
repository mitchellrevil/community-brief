import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ReprocessRequest } from '@/types/api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useReprocessJobMutation } from '@/features/recordings/data/queries';
import { useToast } from '@/components/ui/use-toast';

interface ReprocessAnalysisDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle: string;
}

/**
 * Dialog for reprocessing analysis with optional instructions and new job option
 */
export function ReprocessAnalysisDialog({
  isOpen,
  onOpenChange,
  jobId,
  jobTitle,
}: ReprocessAnalysisDialogProps) {
  const { toast } = useToast();
  const [instructions, setInstructions] = React.useState('');
  const [createNewJob, setCreateNewJob] = React.useState(false);
  
  const reprocessMutation = useReprocessJobMutation();

  const handleReprocess = async () => {
    try {
      const request: ReprocessRequest = {
        instructions: instructions || undefined,
        create_new_job: createNewJob,
      };

      await reprocessMutation.mutateAsync({
        jobId,
        request,
      });

      // Close dialog immediately
      onOpenChange(false);
      
      // Reset form
      setInstructions('');
      setCreateNewJob(false);

      // Show success toast
      toast({
        title: 'Analysis being generated',
        description: createNewJob 
          ? 'New job created. Analysis is now being generated.'
          : 'Analysis is being regenerated. This may take a few minutes.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reprocess analysis',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reprocess Analysis</DialogTitle>
          <DialogDescription>
            Re-run the analysis on "{jobTitle}" with optional new instructions or as a new job
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions textarea */}
          <div className="space-y-2">
            <Label htmlFor="instructions" className="text-sm font-medium">
              Additional Instructions (Optional)
            </Label>
            <Textarea
              id="instructions"
              placeholder="Enter any specific instructions or focus areas for the re-analysis..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the original analysis prompt
            </p>
          </div>

          {/* Create new job checkbox */}
          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <Checkbox
              id="createNewJob"
              checked={createNewJob}
              onCheckedChange={(checked) => setCreateNewJob(checked as boolean)}
              className="mt-1"
            />
            <div className="flex-1">
              <Label htmlFor="createNewJob" className="text-sm font-medium cursor-pointer">
                Create as New Job
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Instead of updating the current job, create a new job with the re-analysis. 
                The original recording will remain unchanged.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={reprocessMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleReprocess}
            disabled={reprocessMutation.isPending}
          >
            {reprocessMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reprocessing...
              </>
            ) : (
              'Reprocess Analysis'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


