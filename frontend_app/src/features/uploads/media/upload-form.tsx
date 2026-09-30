/**
 * MediaUploadForm - Orchestrator Component
 *
 * This is a composition component that orchestrates the upload workflow by
 * combining focused subcomponents:
 * - FileDropzone: File drag-drop and selection
 * - CategorySelector: Service area and meeting type tree
 * - PreSessionForm: Dynamic pre-session fields and prompt preview
 * - UploadProgressSimulator: Upload progress display
 *
 * State management is handled by the useMediaUpload hook.
 */

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronDown, Loader2, Upload } from "lucide-react";
import { FileDropzone } from "./FileDropzone";
import { useMediaUpload } from "./hooks/useMediaUpload";
import { DesktopLayout, MobileLayout } from "./UploadFormLayouts";
import { UploadProgressSimulator } from "./UploadProgressSimulator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { MotionDiv } from "@/components/ui/motion";
import { RetentionDisclaimer } from "@/components/ui/retention-disclaimer";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { isOnlineSync } from "@/lib/online-status";


// Subcomponents

interface MediaUploadFormProps {
  mediaFile?: File | null;
  filePickerVisible?: boolean;
  submitLabel?: string;
  onSuccess?: (jobId: string) => void;
}

export function MediaUploadForm({
  mediaFile,
  filePickerVisible = true,
  submitLabel = "Upload & Analyse",
  onSuccess,
}: MediaUploadFormProps) {
  // Use the centralized hook for all form state and logic
  const upload = useMediaUpload({ initialMediaFile: mediaFile, onSuccess });
  const hasFile = !!upload.formValues.mediaFile;
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);

  // Use one taxonomy source to avoid duplicate category fetches on this page.
  const displayCategories = upload.categories;
  const hasNextPage = false;
  const isFetchingNextPage = false;

  useEffect(() => {
    setCategoryPanelOpen(hasFile);
  }, [hasFile]);

  return (
    <MotionDiv
      className="relative space-y-6 overflow-x-hidden pb-24 sm:space-y-8 md:pb-6"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <Form {...upload.form}>
        <form
          onSubmit={upload.form.handleSubmit(upload.onSubmit)}
          className="space-y-5 sm:space-y-8"
        >
          <input type="hidden" {...upload.form.register("promptCategory")} />
          <input type="hidden" {...upload.form.register("promptSubcategory")} />

          {/* File Dropzone */}
          {filePickerVisible && (
            <MotionDiv variants={fadeInUp}>
              <FileDropzone
                form={upload.form}
                fileType={upload.fileType}
                fileInputRef={upload.fileInputRef}
                transcriptText={upload.transcriptText}
                setTranscriptText={upload.setTranscriptText}
                showTranscriptInput={upload.showTranscriptInput}
                setShowTranscriptInput={upload.setShowTranscriptInput}
                handleFileSelect={upload.handleFileSelect}
                handleDrop={upload.handleDrop}
                handleTranscriptUpload={upload.handleTranscriptUpload}
                isWindowDrag={upload.isWindowDrag}
                setIsWindowDrag={upload.setIsWindowDrag}
                resetForm={upload.resetForm}
              />
            </MotionDiv>
          )}

          {/* Categories & Subcategories Section */}
          <MotionDiv variants={fadeInUp} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setCategoryPanelOpen((open) => !open)}
              aria-expanded={categoryPanelOpen}
              className="group flex w-full items-center justify-between gap-3 border-b px-1 py-3 text-left transition-colors sm:px-2"
            >
              <div className="min-w-0">
                <h3 className="text-base font-semibold sm:text-lg">
                  Categories & Meeting Type
                </h3>
                <p className="text-muted-foreground text-xs sm:text-sm">
                  {hasFile
                    ? "Choose the service area and meeting type for this upload."
                    : "Choose a service area and preview templates before adding a file."}
                </p>
              </div>
              <ChevronDown
                className={`text-muted-foreground group-hover:bg-muted/30 h-5 w-5 flex-shrink-0 rounded-md p-1 transition-transform duration-300 ${categoryPanelOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            <AnimatePresence initial={false}>
              {categoryPanelOpen && (
                <MotionDiv
                  key="category-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 pt-4 sm:space-y-5 sm:pt-5">
                    {/* Validation Error Messages */}
                    <FormField
                      control={upload.form.control}
                      name="promptCategory"
                      render={({ fieldState }) => (
                        <FormItem className="space-y-0">
                          {fieldState.error && (
                            <FormMessage className="text-destructive text-sm">
                              {fieldState.error.message}
                            </FormMessage>
                          )}
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={upload.form.control}
                      name="promptSubcategory"
                      render={({ fieldState }) => (
                        <FormItem className="space-y-0">
                          {fieldState.error && (
                            <FormMessage className="text-destructive text-sm">
                              {fieldState.error.message}
                            </FormMessage>
                          )}
                        </FormItem>
                      )}
                    />

                    {/* Mobile/Desktop Layout */}
                    {upload.isMobile ? (
                      <MobileLayout
                        upload={upload}
                        displayCategories={displayCategories}
                        isFetchingNextPage={isFetchingNextPage}
                        hasNextPage={hasNextPage}
                      />
                    ) : (
                      <DesktopLayout
                        upload={upload}
                        displayCategories={displayCategories}
                        isFetchingNextPage={isFetchingNextPage}
                        hasNextPage={hasNextPage}
                      />
                    )}
                  </div>
                </MotionDiv>
              )}
            </AnimatePresence>
          </MotionDiv>

          {/* Upload Progress */}
          <UploadProgressSimulator
            isActive={
              upload.isUploading || upload.isSubmitting || upload.isConverting
            }
            progress={upload.uploadProgress || undefined}
            show={
              isOnlineSync() &&
              (upload.isUploading ||
                upload.isSubmitting ||
                upload.isConverting ||
                Boolean(upload.uploadError) ||
                upload.isUploadCancelled)
            }
            isConverting={upload.isConverting}
            isFinalizing={upload.isFinalizing}
            conversionProgress={upload.conversionProgress}
            fileName={
              upload.activeUploadFileName || upload.formValues.mediaFile?.name
            }
            isComplete={Boolean(upload.uploadSuccessJobId)}
            errorMessage={upload.uploadError}
            onClose={upload.dismissUploadError}
            onSubmitAnother={upload.resetForm}
            onCancel={upload.cancelUpload}
            isCancelled={upload.isUploadCancelled}
            canCancel={upload.isUploadCancellable}
          />

          {upload.uploadSuccessJobId && (
            <MotionDiv variants={fadeInUp}>
              <Alert className="border-green-600/30 bg-green-50 text-green-800 dark:border-green-500/40 dark:bg-green-950/30 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-300" />
                <AlertDescription className="font-medium">
                  Job was successful: {upload.uploadSuccessJobId}
                </AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          {/* Submit Button */}
          <MotionDiv variants={fadeInUp} className="pt-4">
            <Button
              type="submit"
              disabled={
                upload.isUploading ||
                upload.isSubmitting ||
                !upload.formValues.mediaFile ||
                !upload.currentCategory ||
                !upload.currentSubcategory ||
                upload.isConverting
              }
              className="from-primary to-primary/80 hover:from-primary hover:to-primary focus-visible:ring-primary/50 disabled:from-muted disabled:to-muted disabled:text-muted-foreground h-12 w-full rounded-xl bg-gradient-to-r text-base font-medium shadow-lg disabled:opacity-100 disabled:shadow-none sm:h-14"
            >
              {upload.isUploading || upload.isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  <span className="hidden sm:inline">Processing Upload...</span>
                  <span className="sm:hidden">Processing...</span>
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  {submitLabel}
                </>
              )}
            </Button>
          </MotionDiv>
        </form>
      </Form>

      <RetentionDisclaimer />
    </MotionDiv>
  );
}
