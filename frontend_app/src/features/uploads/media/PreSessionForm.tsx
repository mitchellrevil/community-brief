import { memo } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit,
  Eye,
  FileText,
  Folder as FolderIcon,
} from "lucide-react";
import type {
  PromptTemplate,
  Folder as TemplateFolder,
} from "@/shared/data/templates";
import type { FormField, FormsRecord } from "@/types/forms";
import { FormFieldRenderer } from "@/components/shared/FormFieldRenderer";
import { Button } from "@/components/ui/button";
import { PromptMetadataDisclaimer } from "@/features/uploads/shared/PromptMetadataDisclaimer";
import { cn } from "@/lib/utils";

export interface PreSessionFormProps {
  // Selection data
  categories: Array<TemplateFolder>;
  subcategories: Array<PromptTemplate>;
  currentCategory: string | undefined;
  currentSubcategory: string | undefined;

  // Pre-session form state
  preSessionSections: Array<any>;
  preSessionFormData: FormsRecord;
  hasFormFields: boolean;
  viewMode: "form" | "preview";
  setViewMode: (mode: "form" | "preview") => void;
  handlePreSessionInputChange: (fieldName: string, value: unknown) => void;

  // Prompt preview
  promptPreviewText: string;
  promptPreviewOpen: boolean;
  setPromptPreviewOpen: (open: boolean) => void;
  copiedPrompt: boolean;
  handleCopyPrompt: () => void;
}

function PreSessionFormComponent({
  categories,
  subcategories,
  currentCategory,
  currentSubcategory,
  preSessionSections,
  preSessionFormData,
  hasFormFields,
  viewMode,
  setViewMode,
  handlePreSessionInputChange,
  promptPreviewText,
  promptPreviewOpen,
  setPromptPreviewOpen,
  copiedPrompt,
  handleCopyPrompt,
}: PreSessionFormProps) {
  const selectedSubcategory = subcategories.find(
    (s) => s.id === currentSubcategory,
  );

  if (!currentCategory && !currentSubcategory) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-2 text-center">
          <FolderIcon className="mx-auto h-8 w-8 text-gray-400 sm:h-12 sm:w-12" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select a service area to preview templates
          </p>
        </div>
      </div>
    );
  }

  if (currentCategory && !currentSubcategory) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-2 text-center">
          <FileText className="mx-auto h-8 w-8 text-gray-400 sm:h-12 sm:w-12" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choose a meeting type to continue
          </p>
        </div>
      </div>
    );
  }

  // Full selection - show form/preview
  return (
    <div className="bg-card/60 flex h-full flex-col rounded-xl border p-4 backdrop-blur-sm sm:p-6">
      <div className="flex flex-1 flex-col space-y-4 overflow-hidden">
        <div>
          <h4 className="mb-2 text-base font-semibold sm:text-lg">
            Selection Summary
          </h4>
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <FolderIcon className="h-4 w-4 flex-shrink-0 text-gray-500" />
              <span className="truncate text-sm">
                <strong>Area:</strong>{" "}
                {categories.find((c) => c.id === currentCategory)?.name}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="text-primary h-4 w-4 flex-shrink-0" />
              <span className="truncate text-sm">
                <strong>Type:</strong> {selectedSubcategory?.name}
              </span>
            </div>
          </div>
        </div>

        <PromptMetadataDisclaimer
          metadata={selectedSubcategory?.prompt_metadata}
        />

        {/* Prompt Preview / Pre-session Form area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t pt-4">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <div>
              <p className="text-sm font-medium sm:text-base">
                {viewMode === "form" ? "Session Details" : "Template Preview"}
              </p>
              <p className="text-muted-foreground hidden text-xs sm:block">
                {viewMode === "form"
                  ? "Please fill in the required information."
                  : "This template will shape the AI analysis."}
              </p>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {hasFormFields && (
                <div className="bg-muted mr-2 flex rounded-md p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 px-2 text-xs",
                      viewMode === "form" && "bg-background shadow-sm",
                    )}
                    onClick={() => setViewMode("form")}
                  >
                    <Edit className="mr-1 h-3.5 w-3.5" /> Form
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 px-2 text-xs",
                      viewMode === "preview" && "bg-background shadow-sm",
                    )}
                    onClick={() => setViewMode("preview")}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" /> Preview
                  </Button>
                </div>
              )}

              {viewMode === "preview" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!promptPreviewText}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyPrompt();
                  }}
                  className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
                >
                  {copiedPrompt ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setPromptPreviewOpen(!promptPreviewOpen)}
                className="rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {promptPreviewOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {promptPreviewOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {viewMode === "form" ? (
                <div className="space-y-6 pt-2 pr-2 pb-2">
                  {preSessionSections.map(
                    (section: any, sectionIndex: number) => (
                      <div
                        key={`section_${sectionIndex}`}
                        className="space-y-4"
                      >
                        {section.fields.map((field: FormField) => (
                          <FormFieldRenderer
                            key={field.name}
                            field={field}
                            value={preSessionFormData[field.name]}
                            onChange={handlePreSessionInputChange}
                          />
                        ))}
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="border-border/40 bg-card selection:bg-primary/20 max-h-[30vh] overflow-y-auto rounded-xl border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap shadow-sm lg:h-full">
                  {promptPreviewText || "No template content."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const PreSessionForm = memo(PreSessionFormComponent);
