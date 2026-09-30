/**
 * Layout components for MediaUploadForm
 *
 * These handle responsive layouts for mobile and desktop views.
 */

import { CategorySelector } from "./CategorySelector";
import { PreSessionForm } from "./PreSessionForm";
import type { Folder } from "@/shared/data/templates";
import type { UseMediaUploadResult } from "./hooks/useMediaUpload";
import { Button } from "@/components/ui/button";
import { MotionDiv } from "@/components/ui/motion";


export interface LayoutProps {
  upload: UseMediaUploadResult;
  displayCategories: Array<Folder>;
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

export function MobileLayout({
  upload,
  displayCategories,
  sentinelRef,
  isFetchingNextPage,
  hasNextPage,
}: LayoutProps) {
  return (
    <MotionDiv className="space-y-4" layout>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => upload.setShowSelector(true)}
          className="h-9"
        >
          {upload.currentCategory && upload.currentSubcategory
            ? "Edit selection"
            : "Select service area"}
        </Button>
      </div>

      <PreSessionForm
        categories={displayCategories}
        subcategories={upload.subcategories}
        currentCategory={upload.currentCategory}
        currentSubcategory={upload.currentSubcategory}
        preSessionSections={upload.preSessionSections}
        preSessionFormData={upload.preSessionFormData}
        hasFormFields={upload.hasFormFields}
        viewMode={upload.viewMode}
        setViewMode={upload.setViewMode}
        handlePreSessionInputChange={upload.handlePreSessionInputChange}
        promptPreviewText={upload.promptPreviewText}
        promptPreviewOpen={upload.promptPreviewOpen}
        setPromptPreviewOpen={upload.setPromptPreviewOpen}
        copiedPrompt={upload.copiedPrompt}
        handleCopyPrompt={upload.handleCopyPrompt}
      />

      {upload.showSelector && (
        <div className="fixed inset-0 z-50">
          <div
            className="bg-background/70 absolute inset-0 backdrop-blur-sm"
            onClick={() => upload.setShowSelector(false)}
          />
          <div className="bg-background absolute top-0 bottom-0 left-0 flex w-full max-w-sm flex-col border-r shadow-lg">
            <button
              onClick={() => upload.setShowSelector(false)}
              className="hover:bg-muted absolute top-4 right-4 z-50 rounded-md p-2"
            >
              ✕
            </button>
            <CategorySelector
              categories={displayCategories}
              subcategories={upload.subcategories}
              currentCategory={upload.currentCategory}
              currentSubcategory={upload.currentSubcategory}
              expandedCategories={upload.expandedCategories}
              categorySearch={upload.categorySearch}
              setCategorySearch={upload.setCategorySearch}
              isLoadingCategories={upload.isLoadingCategories}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage}
              toggleCategory={upload.toggleCategory}
              handleCategorySelect={upload.handleCategorySelect}
              handleSubcategorySelect={upload.handleSubcategorySelect}
              getSubcategoriesForCategory={upload.getSubcategoriesForCategory}
              sentinelRef={sentinelRef}
            />
          </div>
        </div>
      )}
    </MotionDiv>
  );
}

export function DesktopLayout({
  upload,
  displayCategories,
  sentinelRef,
  isFetchingNextPage,
  hasNextPage,
}: LayoutProps) {
  return (
    <MotionDiv
      className="flex flex-col gap-4 lg:h-[60vh] lg:flex-row lg:gap-6"
      layout
    >
      <CategorySelector
        categories={displayCategories}
        subcategories={upload.subcategories}
        currentCategory={upload.currentCategory}
        currentSubcategory={upload.currentSubcategory}
        expandedCategories={upload.expandedCategories}
        categorySearch={upload.categorySearch}
        setCategorySearch={upload.setCategorySearch}
        isLoadingCategories={upload.isLoadingCategories}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        toggleCategory={upload.toggleCategory}
        handleCategorySelect={upload.handleCategorySelect}
        handleSubcategorySelect={upload.handleSubcategorySelect}
        getSubcategoriesForCategory={upload.getSubcategoriesForCategory}
        sentinelRef={sentinelRef}
      />

      <MotionDiv
        className="min-h-[200px] flex-1 overflow-hidden lg:h-[60vh]"
        layout
      >
        <PreSessionForm
          categories={displayCategories}
          subcategories={upload.subcategories}
          currentCategory={upload.currentCategory}
          currentSubcategory={upload.currentSubcategory}
          preSessionSections={upload.preSessionSections}
          preSessionFormData={upload.preSessionFormData}
          hasFormFields={upload.hasFormFields}
          viewMode={upload.viewMode}
          setViewMode={upload.setViewMode}
          handlePreSessionInputChange={upload.handlePreSessionInputChange}
          promptPreviewText={upload.promptPreviewText}
          promptPreviewOpen={upload.promptPreviewOpen}
          setPromptPreviewOpen={upload.setPromptPreviewOpen}
          copiedPrompt={upload.copiedPrompt}
          handleCopyPrompt={upload.handleCopyPrompt}
        />
      </MotionDiv>
    </MotionDiv>
  );
}
