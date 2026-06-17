/**
 * Layout components for MediaUploadForm
 * 
 * These handle responsive layouts for mobile and desktop views.
 */

import { CategorySelector } from "./CategorySelector";
import { PreSessionForm } from "./PreSessionForm";
import type { UseMediaUploadResult } from "./hooks/useMediaUpload";
import type { CategoryResponse } from "@/features/prompt-management/data/api";
import { Button } from "@/components/ui/button";
import { MotionDiv } from "@/components/ui/motion";

export interface LayoutProps {
  upload: UseMediaUploadResult;
  displayCategories: Array<CategoryResponse>;
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

export function MobileLayout({ upload, displayCategories, sentinelRef, isFetchingNextPage, hasNextPage }: LayoutProps) {
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
          {upload.currentCategory && upload.currentSubcategory ? "Edit selection" : "Select service area"}
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
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => upload.setShowSelector(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-full max-w-sm bg-background border-r shadow-lg flex flex-col">
            <button
              onClick={() => upload.setShowSelector(false)}
              className="absolute top-4 right-4 z-50 p-2 rounded-md hover:bg-muted"
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

export function DesktopLayout({ upload, displayCategories, sentinelRef, isFetchingNextPage, hasNextPage }: LayoutProps) {
  return (
    <MotionDiv className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:h-[60vh]" layout>
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
      
      <MotionDiv className="flex-1 min-h-[200px] lg:h-[60vh] overflow-hidden" layout>
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
