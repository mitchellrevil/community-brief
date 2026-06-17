import { memo } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Edit, Eye, FileText, Folder } from "lucide-react";
import type { CategoryResponse, SubcategoryResponse } from "@/features/prompt-management/data/api";
import type { FormField, FormsRecord } from "@/types/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {  FormFieldRenderer } from "@/components/shared/FormFieldRenderer";

export interface PreSessionFormProps {
  // Selection data
  categories: Array<CategoryResponse>;
  subcategories: Array<SubcategoryResponse>;
  currentCategory: string | undefined;
  currentSubcategory: string | undefined;
  
  // Pre-session form state
  preSessionSections: Array<any>;
  preSessionFormData: FormsRecord;
  hasFormFields: boolean;
  viewMode: 'form' | 'preview';
  setViewMode: (mode: 'form' | 'preview') => void;
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
  if (!currentCategory && !currentSubcategory) {
    return (
      <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="text-center space-y-2">
          <Folder className="h-8 w-8 sm:h-12 sm:w-12 mx-auto text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a service area to preview prompts</p>
        </div>
      </div>
    );
  }

  if (currentCategory && !currentSubcategory) {
    return (
      <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="text-center space-y-2">
          <FileText className="h-8 w-8 sm:h-12 sm:w-12 mx-auto text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Choose a meeting type to continue</p>
        </div>
      </div>
    );
  }

  // Full selection - show form/preview
  return (
    <div className="h-full border rounded-xl bg-card/60 backdrop-blur-sm p-4 sm:p-6 flex flex-col">
      <div className="flex-1 space-y-4 overflow-hidden flex flex-col">
        <div>
          <h4 className="font-semibold text-base sm:text-lg mb-2">Selection Summary</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              <Folder className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <span className="text-sm truncate"><strong>Area:</strong> {categories.find(c => c.id === currentCategory)?.name}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm truncate"><strong>Type:</strong> {subcategories.find(s => s.id === currentSubcategory)?.name}</span>
            </div>
          </div>
        </div>

        {/* Prompt Preview / Pre-session Form area */}
        <div className="flex-1 border-t pt-4 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div>
              <p className="font-medium text-sm sm:text-base">
                {viewMode === 'form' ? 'Session Details' : 'Prompt Preview'}
              </p>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {viewMode === 'form' 
                  ? 'Please fill in the required information.' 
                  : 'These prompts will shape the AI analysis.'}
              </p>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-2">
              {hasFormFields && (
                <div className="flex bg-muted rounded-md p-0.5 mr-2">
                   <Button 
                     type="button" 
                     variant="ghost" 
                     size="sm" 
                     className={cn("h-7 px-2 text-xs", viewMode === 'form' && "bg-background shadow-sm")}
                     onClick={() => setViewMode('form')}
                   >
                     <Edit className="h-3.5 w-3.5 mr-1" /> Form
                   </Button>
                   <Button 
                     type="button" 
                     variant="ghost" 
                     size="sm" 
                     className={cn("h-7 px-2 text-xs", viewMode === 'preview' && "bg-background shadow-sm")}
                     onClick={() => setViewMode('preview')}
                   >
                     <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                   </Button>
                </div>
              )}
              
              {viewMode === 'preview' && (
                <Button type="button" variant="outline" size="sm" disabled={!promptPreviewText} onClick={(e) => { e.stopPropagation(); handleCopyPrompt(); }} className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 p-0">
                  {copiedPrompt ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
              <button type="button" onClick={() => setPromptPreviewOpen(!promptPreviewOpen)} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                {promptPreviewOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
          
          {promptPreviewOpen && (
            <div className="flex-1 overflow-y-auto min-h-0">
              {viewMode === 'form' ? (
                <div className="space-y-6 pt-2 pr-2 pb-2">
                  {preSessionSections.map((section: any, sectionIndex: number) => (
                      <div key={`section_${sectionIndex}`} className="space-y-4">
                        {section.fields.map((field: FormField) => (
                          <FormFieldRenderer
                            key={field.name}
                            field={field}
                            value={preSessionFormData[field.name]}
                            onChange={handlePreSessionInputChange}
                          />
                        ))}
                      </div>
                  ))}
                </div>
              ) : (
                <div className="max-h-[30vh] lg:h-full rounded-xl border border-border/40 bg-card p-3 overflow-y-auto text-xs whitespace-pre-wrap font-mono leading-relaxed selection:bg-primary/20 shadow-sm">
                  {promptPreviewText || 'No prompts.'}
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
