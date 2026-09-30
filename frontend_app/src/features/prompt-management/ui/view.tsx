import MDPreview from "@uiw/react-markdown-preview";
import { Download, Edit, Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { serializePromptFile } from "../lib/prompt-file";
import { usePromptManagement } from "../state/context";
import { canEditPrompt } from "../state/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MotionDiv } from "@/components/ui/motion";
import { useUserPermissions } from "@/hooks/usePermissions";
import { formatDate } from "@/lib/date-utils";
import { AnimatePresence, fadeIn } from "@/lib/motion";
import {
  getPromptVisibilityLabel,
  normalizePromptVisibility,
} from "@/lib/prompt-visibility";


interface PromptBrowseViewProps {
  onEdit: () => void;
}

export function PromptBrowseView({ onEdit }: PromptBrowseViewProps) {
  const { selectedPrompt, selectedCategory } = usePromptManagement();
  const { data: currentUser } = useUserPermissions();

  if (!selectedPrompt) {
    return (
      <MotionDiv
        className="text-muted-foreground flex h-full flex-col items-center justify-center"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
      >
        <div className="bg-muted/50 mb-4 rounded-full p-4">
          <Eye className="h-8 w-8 opacity-50" />
        </div>
        <h3 className="mb-2 text-lg font-medium">No template selected</h3>
        <p className="max-w-xs text-center text-sm">
          Select a template from the library to view its content or create a new
          one.
        </p>
      </MotionDiv>
    );
  }

  const prompts = selectedPrompt.prompts;
  const promptKeys = Object.keys(prompts);
  const promptContent = promptKeys.length > 0 ? prompts[promptKeys[0]] : "";
  const updatedBy =
    selectedPrompt.updated_by_display_name || selectedPrompt.updated_by_user_id;
  const visibility = normalizePromptVisibility(selectedPrompt.visibility);
  const visibilityLabel = getPromptVisibilityLabel(visibility);
  const canEdit = canEditPrompt(selectedPrompt, currentUser);
  const updatedAt = selectedPrompt.updated_at
    ? formatDate(selectedPrompt.updated_at)
    : "Unknown";

  const handleExportPrompt = () => {
    try {
      const blob = new Blob([serializePromptFile(selectedPrompt)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedPrompt.name}.prompt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export template.",
      );
    }
  };

  return (
    <AnimatePresence mode="wait">
      <MotionDiv
        key={selectedPrompt.id}
        className="bg-background flex h-full min-h-0 flex-col"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div className="bg-background border-b px-5 py-4">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3 sm:items-center">
                <div className="bg-muted/30 text-muted-foreground hidden rounded-lg border p-2 sm:flex">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-xl font-semibold tracking-tight">
                    {selectedPrompt.name}
                  </h1>
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                    <Badge
                      variant="secondary"
                      className="max-w-full truncate font-normal sm:max-w-[18rem]"
                    >
                      {selectedCategory?.name || "Unknown folder"}
                    </Badge>
                    <span>
                      Last modified {updatedAt}
                      {updatedBy ? ` by ${updatedBy}` : ""}
                    </span>
                    <span>{visibilityLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 2xl:shrink-0 2xl:justify-end">
              <Button variant="outline" size="sm" onClick={handleExportPrompt}>
                <Download className="h-4 w-4" />
                Export
              </Button>
              {canEdit && (
                <Button size="sm" onClick={onEdit}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-muted/20 min-h-0 flex-1 overflow-y-auto p-5">
          {promptContent ? (
            <article className="bg-background mx-auto max-w-4xl px-8 py-7">
              <MDPreview
                source={promptContent}
                style={{
                  backgroundColor: "transparent",
                  color: "inherit",
                  fontSize: "0.95rem",
                }}
                data-color-mode="auto"
              />
            </article>
          ) : (
            <div className="bg-background text-muted-foreground mx-auto flex h-64 max-w-4xl flex-col items-center justify-center rounded-lg border border-dashed">
              <p className="mb-4">This template is empty</p>
              {canEdit && <Button onClick={onEdit}>Add Content</Button>}
            </div>
          )}
        </div>
      </MotionDiv>
    </AnimatePresence>
  );
}
