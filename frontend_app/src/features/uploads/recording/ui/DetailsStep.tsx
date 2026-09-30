import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
} from "lucide-react";
import type { Folder, PromptTemplate } from "@/shared/data/templates";
import type { FormSection, FormsRecord } from "@/types/forms";
import { FormFieldRenderer } from "@/components/shared/FormFieldRenderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { PromptMetadataDisclaimer } from "@/features/uploads/shared/PromptMetadataDisclaimer";

interface DetailsStepProps {
  selectedCategory: Folder;
  selectedSubcategory: PromptTemplate;
  preSessionSections: Array<FormSection>;
  preSessionFormData: FormsRecord;
  hasFormFields: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onInputChange: (fieldName: string, value: unknown) => void;
  onContinue: () => void;
}

export function DetailsStep({
  selectedCategory,
  selectedSubcategory,
  preSessionSections,
  preSessionFormData,
  hasFormFields,
  isSubmitting,
  onBack,
  onInputChange,
  onContinue,
}: DetailsStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500 sm:space-y-8">
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:pb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="self-start rounded-full"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold sm:text-xl">Session Details</h2>
          <SmartBreadcrumb
            className="mt-1"
            showHome={false}
            items={[
              { label: selectedCategory.name },
              { label: selectedSubcategory.name, isCurrentPage: true },
            ]}
          />
        </div>
      </div>

      <PromptMetadataDisclaimer
        metadata={selectedSubcategory.prompt_metadata}
      />

      <div className="grid gap-6 sm:gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {hasFormFields ? (
            <div className="space-y-8">
              {preSessionSections.map((section, sectionIndex) => (
                <div key={`section_${sectionIndex}`} className="space-y-4">
                  {section.fields.length > 0 && (
                    <div className="grid gap-6">
                      {section.fields.map((field) => (
                        <FormFieldRenderer
                          key={field.name}
                          field={field}
                          value={preSessionFormData[field.name]}
                          onChange={onInputChange}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-muted/30 rounded-xl border-2 border-dashed p-6 text-center sm:p-8">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500 sm:mb-4 sm:h-12 sm:w-12" />
              <h3 className="mb-2 text-base font-medium sm:text-lg">
                All Set!
              </h3>
              <p className="text-muted-foreground text-sm">
                No additional information is required for this meeting type. You
                can proceed to recording.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-muted/30 border-none">
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <span className="text-muted-foreground mb-1 block">
                  Service Area
                </span>
                <span className="font-medium">{selectedCategory.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground mb-1 block">
                  Meeting Type
                </span>
                <span className="font-medium">{selectedSubcategory.name}</span>
              </div>
              <div className="border-t pt-4">
                <div className="text-muted-foreground flex items-start gap-2 text-xs">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Ensure all required fields are filled correctly before
                    starting the session.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            data-tutorial="continue-button"
            onClick={onContinue}
            disabled={isSubmitting}
            className="h-11 w-full text-sm shadow-lg sm:h-12 sm:text-base"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
