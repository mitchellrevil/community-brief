import { Download, Edit, Eye } from "lucide-react";
import MDPreview from "@uiw/react-markdown-preview";
import { usePromptManagement } from "../state/context";
import { canEditPrompt } from "../state/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/date-utils";
import {
  getPromptVisibilityLabel,
  normalizePromptVisibility,
} from "@/lib/prompt-visibility";
import { useUserPermissions } from "@/hooks/usePermissions";
import { MotionDiv } from "@/components/ui/motion";
import { AnimatePresence, fadeIn } from "@/lib/motion";

interface PromptBrowseViewProps {
  onEdit: () => void;
}

export function PromptBrowseView({ onEdit }: PromptBrowseViewProps) {
  const { selectedPrompt, selectedCategory } = usePromptManagement();
  const { data: currentUser } = useUserPermissions();

  if (!selectedPrompt) {
    return (
      <MotionDiv
        className="flex flex-col items-center justify-center h-full text-muted-foreground"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
      >
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <Eye className="h-8 w-8 opacity-50" />
        </div>
        <h3 className="text-lg font-medium mb-2">No prompt selected</h3>
        <p className="text-sm max-w-xs text-center">
          Select a prompt from the sidebar to view its content or create a new one.
        </p>
      </MotionDiv>
    );
  }

  const prompts = selectedPrompt.prompts;
  const promptKeys = Object.keys(prompts);
  const promptContent = promptKeys.length > 0 ? prompts[promptKeys[0]] : "";

  const updatedBy = selectedPrompt.updated_by_display_name || selectedPrompt.updated_by_user_id;
  const visibility = normalizePromptVisibility(selectedPrompt.prompt_visibility);
  const visibilityLabel = getPromptVisibilityLabel(visibility);
  const canEdit = canEditPrompt(selectedPrompt, currentUser);

  const handleExportPrompt = () => {
    const blob = new Blob([promptContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPrompt.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isTiny = typeof window !== 'undefined' && window.innerWidth < 480;

  return (
    <AnimatePresence mode="wait">
      <MotionDiv
        key={selectedPrompt.id}
        className="flex flex-col h-full"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 xs:px-4 sm:px-6 py-3 xs:py-4 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10 gap-2 sm:gap-0">
        <div className="min-w-0 flex-1 w-full sm:w-auto">
          <h1 className={`${isTiny ? 'text-sm' : 'text-base xs:text-lg sm:text-xl'} font-semibold tracking-tight mb-1 truncate`}>
            {selectedPrompt.name}
          </h1>
          <div className="flex items-center gap-1.5 xs:gap-2 text-[0.7rem] xs:text-xs text-muted-foreground flex-wrap">
            <Badge variant="secondary" className={`${isTiny ? 'text-[0.65rem] px-1.5' : 'text-xs'} font-normal`}>
              {selectedCategory?.name || 'Unknown Folder'}
            </Badge>
            {!isTiny && (
              <>
                <span>•</span>
                <span className="truncate">
                  Last modified {selectedPrompt.updated_at ? formatDate(selectedPrompt.updated_at) : 'Unknown'}
                  {updatedBy ? ` by ${updatedBy}` : ''}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 xs:gap-2 w-full sm:w-auto justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPrompt}
            className={isTiny ? 'h-8 text-xs px-2' : 'h-9'}
          >
            <Download className={`${isTiny ? 'h-3 w-3' : 'h-4 w-4'} ${!isTiny && 'mr-2'}`} />
            {!isTiny && 'Export'}
          </Button>

          {canEdit && (
            <Button
              size="sm"
              onClick={onEdit}
              className={isTiny ? 'h-8 text-xs px-2' : 'h-9'}
            >
              <Edit className={`${isTiny ? 'h-3 w-3' : 'h-4 w-4'} ${!isTiny && 'mr-2'}`} />
              {!isTiny && 'Edit'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 xs:p-4 sm:p-6 space-y-4 xs:space-y-6">
        {promptContent ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Prompt Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose dark:prose-invert max-w-none">
                    <MDPreview
                      source={promptContent}
                      style={{
                        backgroundColor: 'transparent',
                        color: 'inherit',
                        fontSize: '0.95rem',
                      }}
                      data-color-mode="auto"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Characters</span>
                    <span className="font-medium">{promptContent.length}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Words</span>
                    <span className="font-medium">{promptContent.split(/\s+/).length}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Lines</span>
                    <span className="font-medium">{promptContent.split('\n').length}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Visibility</span>
                    <span className="font-medium">{visibilityLabel}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
            <p className="mb-4">This prompt is empty</p>
            {canEdit && (
              <Button onClick={onEdit}>Add Content</Button>
            )}
          </div>
        )}
      </div>
    </MotionDiv>
    </AnimatePresence>
  );
}
