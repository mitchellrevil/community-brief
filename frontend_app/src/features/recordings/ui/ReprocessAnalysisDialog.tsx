import type { ReprocessRequest } from "@/types/api";
import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useReprocessJobMutation } from "@/features/recordings/data/queries";
import { useCategoryData } from "@/hooks/useCategoryData";
import { Loader2 } from "lucide-react";

const KEEP_CURRENT_RECORDING_TYPE = "__keep_current_recording_type__";

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
  const [instructions, setInstructions] = React.useState("");
  const [createNewJob, setCreateNewJob] = React.useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = React.useState("");

  const reprocessMutation = useReprocessJobMutation();
  const {
    categories,
    getSubcategoriesForCategory,
    isLoading: isLoadingTypes,
  } = useCategoryData();

  const categoriesWithSubtypes = React.useMemo(
    () =>
      categories
        .filter(
          (category) => getSubcategoriesForCategory(category.id).length > 0,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, getSubcategoriesForCategory],
  );
  const selectedSubcategories = React.useMemo(
    () =>
      selectedCategoryId
        ? [...getSubcategoriesForCategory(selectedCategoryId)].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
        : [],
    [getSubcategoriesForCategory, selectedCategoryId],
  );
  const needsSubtype = Boolean(selectedCategoryId && !selectedSubcategoryId);

  const handleCategoryChange = (value: string) => {
    setSelectedCategoryId(value === KEEP_CURRENT_RECORDING_TYPE ? "" : value);
    setSelectedSubcategoryId("");
  };

  const handleReprocess = async () => {
    if (needsSubtype) return;

    try {
      const request: ReprocessRequest = {
        instructions: instructions || undefined,
        create_new_job: createNewJob,
      };
      if (selectedSubcategoryId) {
        request.prompt_category_id = selectedCategoryId;
        request.prompt_subcategory_id = selectedSubcategoryId;
      }

      await reprocessMutation.mutateAsync({
        jobId,
        request,
      });

      // Close dialog immediately
      onOpenChange(false);

      // Reset form
      setInstructions("");
      setCreateNewJob(false);
      setSelectedCategoryId("");
      setSelectedSubcategoryId("");

      // Show success toast
      toast({
        title: "Analysis being generated",
        description: createNewJob
          ? "New job created. Analysis is now being generated."
          : "Analysis is being regenerated. This may take a few minutes.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to reprocess analysis",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reprocess Analysis</DialogTitle>
          <DialogDescription>
            Re-run the analysis on "{jobTitle}" with optional new instructions
            or as a new job
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
            <p className="text-muted-foreground text-xs">
              Leave empty to use the original analysis prompt
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="recordingType" className="text-sm font-medium">
                Recording Type (Optional)
              </Label>
              <Select
                value={selectedCategoryId || KEEP_CURRENT_RECORDING_TYPE}
                onValueChange={handleCategoryChange}
                disabled={reprocessMutation.isPending || isLoadingTypes}
              >
                <SelectTrigger id="recordingType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP_CURRENT_RECORDING_TYPE}>
                    Keep current recording type
                  </SelectItem>
                  {categoriesWithSubtypes.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recordingSubtype" className="text-sm font-medium">
                Subtype
              </Label>
              <Select
                value={selectedSubcategoryId}
                onValueChange={setSelectedSubcategoryId}
                disabled={
                  !selectedCategoryId ||
                  reprocessMutation.isPending ||
                  isLoadingTypes
                }
              >
                <SelectTrigger id="recordingSubtype">
                  <SelectValue
                    placeholder={
                      selectedCategoryId
                        ? "Select a subtype"
                        : "Choose a recording type first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {selectedSubcategories.map((subcategory) => (
                    <SelectItem key={subcategory.id} value={subcategory.id}>
                      {subcategory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {selectedCategoryId
                  ? "Choose a subtype to reprocess with a different prompt"
                  : "Leave unchanged to reuse the current recording type"}
              </p>
            </div>
          </div>

          {/* Create new job checkbox */}
          <div className="bg-muted/50 flex items-start gap-2 rounded-lg p-3">
            <Checkbox
              id="createNewJob"
              checked={createNewJob}
              onCheckedChange={(checked) => setCreateNewJob(checked as boolean)}
              className="mt-1"
            />
            <div className="flex-1">
              <Label
                htmlFor="createNewJob"
                className="cursor-pointer text-sm font-medium"
              >
                Create as New Job
              </Label>
              <p className="text-muted-foreground mt-1 text-xs">
                Instead of updating the current job, create a new job with the
                re-analysis. The original recording will remain unchanged.
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
            disabled={reprocessMutation.isPending || needsSubtype}
          >
            {reprocessMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reprocessing...
              </>
            ) : (
              "Reprocess Analysis"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
